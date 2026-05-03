<?php
// SPDX-License-Identifier: GPL-2.0-or-later

namespace MediaWiki\Extension\CollabPatrol\Api;

use ApiBase;
use ApiMain;
use MediaWiki\Extension\CollabPatrol\CollabPatrolStore;
use MediaWiki\Revision\RevisionStore;
use MediaWiki\User\UserFactory;
use Wikimedia\ParamValidator\ParamValidator;
use Wikimedia\Rdbms\ILoadBalancer;

class ApiCollabPatrol extends ApiBase {

	private CollabPatrolStore $store;
	private RevisionStore $revisionStore;
	private UserFactory $userFactory;

	public function __construct(
		ApiMain $main,
		string $action,
		ILoadBalancer $lb,
		UserFactory $userFactory,
		RevisionStore $revisionStore
	) {
		parent::__construct( $main, $action );
		$this->store = new CollabPatrolStore( $lb, $this->getConfig() );
		$this->revisionStore = $revisionStore;
		$this->userFactory = $userFactory;
	}

	public function execute(): void {
		$this->checkUserRightsAny( 'collabpatrol-use' );
		$params = $this->extractRequestParams();
		$subaction = $params['subaction'];
		$user = $this->getUser();

		switch ( $subaction ) {
			case 'get':
				$this->executeGet( $params );
				break;
			case 'set':
				$this->executeSet( $params, $user );
				break;
			case 'remove':
				$this->executeRemove( $params, $user );
				break;
			case 'history':
				$this->executeHistory( $params );
				break;
			case 'list':
				$this->executeList( $params );
				break;
			case 'stats':
				$this->executeStats();
				break;
			case 'batchget':
				$this->executeBatchGet( $params );
				break;
			case 'chat_get':
				$this->executeChatGet( $params );
				break;
			case 'chat_post':
				$this->executeChatPost( $params, $user );
				break;
			case 'chat_delete':
				$this->executeChatDelete( $params, $user );
				break;
			default:
				$this->dieWithError( 'apierror-invalidparameter', 'subaction' );
		}
	}


	private function executeGet( array $params ): void {
		$revId = (int)$params['revid'];
		$entry = $this->store->getEntry( $revId );
		if ( $entry ) {
			$entry['history'] = $this->store->getHistory( $revId );
			$this->getResult()->addValue( null, 'collabpatrol', $entry );
		} else {
			$this->getResult()->addValue( null, 'collabpatrol', null );
		}
	}

	private function executeSet( array $params, $user ): void {
		$this->requirePostedParameters( [ 'revid', 'status' ] );
		$revId = (int)$params['revid'];
		$status = $params['status'];
		$comment = $params['comment'] ?? '';
		$allowedStatuses = [ 'pending', 'in_progress', 'finished' ];
		if ( !in_array( $status, $allowedStatuses, true ) ) {
			$this->dieWithError( 'apierror-invalidparameter', 'status' );
		}
		$rev = $this->revisionStore->getRevisionById( $revId );
		if ( !$rev ) {
			$this->dieWithError( 'apierror-nosuchrevid', 'revid' );
		}
		$this->store->upsertEntry( $revId, $rev->getPageId(), $status, $user, $comment );
		if ( $status === 'finished' && $this->getConfig()->get( 'CollabPatrolAutoPatrol' ) ) {
			$this->patrolRevision( $revId );
		}
		$this->getResult()->addValue( null, 'collabpatrol', [
			'result' => 'success',
			'revid'  => $revId,
			'status' => $status,
		] );
	}

	private function executeRemove( array $params, $user ): void {
		$this->requirePostedParameters( [ 'revid' ] );
		if ( !$user->isAllowed( 'collabpatrol-admin' ) ) {
			$existing = $this->store->getEntry( (int)$params['revid'] );
			if ( !$existing || $existing['userText'] !== $user->getName() ) {
				$this->dieWithError( 'apierror-permissiondenied', 'notowner' );
			}
		}
		$this->store->deleteEntry( (int)$params['revid'] );
		$this->getResult()->addValue( null, 'collabpatrol', [ 'result' => 'success' ] );
	}

	private function executeHistory( array $params ): void {
		$this->getResult()->addValue( null, 'collabpatrol', [
			'history' => $this->store->getHistory( (int)$params['revid'] )
		] );
	}

	private function executeList( array $params ): void {
		$this->getResult()->addValue( null, 'collabpatrol', [
			'entries' => $this->store->getEntriesByStatus( $params['filterstatus'] ?? 'all' )
		] );
	}

	private function executeStats(): void {
		$this->getResult()->addValue( null, 'collabpatrol', [
			'stats' => $this->store->getStats()
		] );
	}

	private function executeBatchGet( array $params ): void {
		$revIds = array_filter( array_map( 'intval', explode( '|', $params['revids'] ) ) );
		if ( count( $revIds ) > 500 ) {
			$revIds = array_slice( $revIds, 0, 500 );
		}
		$this->getResult()->addValue( null, 'collabpatrol', [
			'entries' => $this->store->getEntriesForRevisions( $revIds )
		] );
	}


	private function executeChatGet( array $params ): void {
		if ( !$this->getConfig()->get( 'CollabPatrolChatEnabled' ) ) {
			$this->dieWithError( 'apierror-disabled', 'chat' );
		}
		$revId = (int)$params['revid'];
		$messages = $this->store->getChatMessages( $revId );
		$user = $this->getUser();
		$isMod = $this->isChatModerator( $user );

		$sanitized = [];
		foreach ( $messages as $msg ) {
			if ( $msg['deleted'] ) {
				$sanitized[] = [
					'id'        => $msg['id'],
					'deleted'   => true,
					'timestamp' => $msg['timestamp'],
					'deletedBy' => $isMod ? $msg['deletedBy'] : '',
					'userText'  => $isMod ? $msg['userText'] : '',
				];
			} else {
				$sanitized[] = $msg;
			}
		}

		$this->getResult()->addValue( null, 'collabpatrol', [
			'messages'  => $sanitized,
			'isMod'     => $isMod,
			'chatEnabled' => true,
		] );
	}

	private function executeChatPost( array $params, $user ): void {
		$this->requirePostedParameters( [ 'revid', 'message' ] );

		if ( !$this->getConfig()->get( 'CollabPatrolChatEnabled' ) ) {
			$this->dieWithError( 'apierror-disabled', 'chat' );
		}

		$revId = (int)$params['revid'];
		$message = trim( $params['message'] ?? '' );

		if ( $message === '' ) {
			$this->dieWithError( 'apierror-missingparam', 'message' );
		}

		$maxLen = (int)$this->getConfig()->get( 'CollabPatrolChatMaxLength' );
		if ( mb_strlen( $message ) > $maxLen ) {
			$this->dieWithError( [ 'collabpatrol-chat-too-long' ], 'message_too_long' );
		}

		$bannedWords = $this->getConfig()->get( 'CollabPatrolChatBannedWords' );
		if ( is_array( $bannedWords ) ) {
			foreach ( $bannedWords as $word ) {
				if ( $word !== '' && mb_stripos( $message, $word ) !== false ) {
					$this->dieWithError( [ 'collabpatrol-chat-banned-word' ], 'banned_word' );
				}
			}
		}

		$entry = $this->store->getEntry( $revId );
		if ( !$entry || $entry['status'] === 'finished' ) {
			$this->dieWithError( 'apierror-invalidparameter', 'revid' );
		}

		$msgId = $this->store->addChatMessage( $revId, $user, $message );
		$this->getResult()->addValue( null, 'collabpatrol', [
			'result'    => 'success',
			'msgId'     => $msgId,
			'userText'  => $user->getName(),
			'timestamp' => time(),
			'message'   => $message,
		] );
	}

	private function executeChatDelete( array $params, $user ): void {
		$this->requirePostedParameters( [ 'msgid' ] );

		if ( !$this->getConfig()->get( 'CollabPatrolChatEnabled' ) ) {
			$this->dieWithError( 'apierror-disabled', 'chat' );
		}

		$msgId = (int)$params['msgid'];

		if ( !$this->isChatModerator( $user ) ) {
			$msg = $this->store->getChatMessage( $msgId );
			if ( !$msg || $msg['userText'] !== $user->getName() ) {
				$this->dieWithError( 'apierror-permissiondenied', 'notowner' );
			}
		}

		$ok = $this->store->deleteChatMessage( $msgId, $user->getName() );
		$this->getResult()->addValue( null, 'collabpatrol', [
			'result' => $ok ? 'success' : 'notfound',
		] );
	}


		private function isChatModerator( $user ): bool {
		if ( $user->isAllowed( 'collabpatrol-admin' ) ) {
			return true;
		}
		$moderators = $this->getConfig()->get( 'CollabPatrolChatModerators' );
		if ( is_array( $moderators ) && in_array( $user->getName(), $moderators, true ) ) {
			return true;
		}
		return false;
	}

	private function patrolRevision( int $revId ): void {
		$api = new \ApiMain(
			new \FauxRequest( [
				'action' => 'patrol',
				'revid'  => $revId,
				'token'  => $this->getUser()->getEditToken( 'patrol' ),
				'format' => 'json',
			], true ),
			false
		);
		try {
			$api->execute();
		} catch ( \Exception $e ) {
		}
	}


	public function getAllowedParams(): array {
		return [
			'subaction' => [
				ParamValidator::PARAM_REQUIRED => true,
				ParamValidator::PARAM_TYPE => [
					'get', 'set', 'remove', 'history', 'list', 'stats', 'batchget',
					'chat_get', 'chat_post', 'chat_delete',
				],
			],
			'revid'        => [ ParamValidator::PARAM_TYPE => 'integer' ],
			'revids'       => [ ParamValidator::PARAM_TYPE => 'string' ],
			'status'       => [ ParamValidator::PARAM_TYPE => [ 'pending', 'in_progress', 'finished' ] ],
			'comment'      => [ ParamValidator::PARAM_TYPE => 'string', ParamValidator::PARAM_DEFAULT => '' ],
			'filterstatus' => [
				ParamValidator::PARAM_TYPE => [ 'all', 'pending', 'in_progress', 'finished' ],
				ParamValidator::PARAM_DEFAULT => 'all',
			],
			'message'      => [ ParamValidator::PARAM_TYPE => 'string', ParamValidator::PARAM_DEFAULT => '' ],
			'msgid'        => [ ParamValidator::PARAM_TYPE => 'integer' ],
		];
	}

	public function needsToken(): string {
		$sub = $this->getRequest()->getVal( 'subaction', '' );
		return in_array( $sub, [ 'set', 'remove', 'chat_post', 'chat_delete' ], true ) ? 'csrf' : '';
	}

	public function isWriteMode(): bool {
		$sub = $this->getRequest()->getVal( 'subaction', '' );
		return in_array( $sub, [ 'set', 'remove', 'chat_post', 'chat_delete' ], true );
	}

	public function mustBePosted(): bool {
		$sub = $this->getRequest()->getVal( 'subaction', '' );
		return in_array( $sub, [ 'set', 'remove', 'chat_post', 'chat_delete' ], true );
	}
}
