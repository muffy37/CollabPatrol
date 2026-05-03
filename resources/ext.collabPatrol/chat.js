( function () {
	'use strict';

	if ( !mw.config.get( 'wgCollabPatrolChatEnabled' ) ) {
		return;
	}

	var CP = window.CollabPatrol;
	var skin = mw.config.get( 'skin' );

	if ( skin === 'minerva' ) {
		return;
	}

	var MAX_LEN = mw.config.get( 'wgCollabPatrolChatMaxLength' ) || 500;
	var currentRevId = null;
	var isMod = false;
	var refreshTimer = null;
	var $chatPanel = null;
	var isOpen = false;


	function buildPanel() {
		$chatPanel = $( '<div>' ).addClass( 'cp-chat-panel' ).hide();

		var $header = $( '<div>' ).addClass( 'cp-chat-header' );
		var $title = $( '<span>' ).addClass( 'cp-chat-title' ).text( '💬 ' + mw.msg( 'collabpatrol-chat-title' ) );
		var $count = $( '<span>' ).addClass( 'cp-chat-count' );
		var $toggle = $( '<button>' ).addClass( 'cp-chat-toggle' ).text( mw.msg( 'collabpatrol-chat-toggle-open' ) );
		$toggle.on( 'click', function () {
			togglePanel();
		} );
		$header.append( $title, $count, $toggle );

		var $body = $( '<div>' ).addClass( 'cp-chat-body' ).hide();
		var $messages = $( '<div>' ).addClass( 'cp-chat-messages' );
		var $composer = buildComposer();
		$body.append( $messages, $composer );

		$chatPanel.append( $header, $body );

		mw.hook( 'collabpatrol.entryActive' ).add( function ( revId ) {
			currentRevId = revId;
			attachPanel();
			loadMessages();
			startRefresh();
		} );

		mw.hook( 'collabpatrol.entryFinished' ).add( function () {
			currentRevId = null;
			stopRefresh();
			if ( $chatPanel ) {
				$chatPanel.hide();
			}
		} );

		var existingRevId = CP.getRevId();
		if ( existingRevId ) {
			CP.api.getEntry( existingRevId ).then( function ( entry ) {
				if ( entry && entry.status !== 'finished' ) {
					currentRevId = existingRevId;
					attachPanel();
					loadMessages();
					startRefresh();
				}
			} );
		}
	}

	function attachPanel() {
		$chatPanel.detach();

		var $wrapper = $( '.collabpatrol-wrapper' ).last();
		if ( $wrapper.length ) {
			$wrapper.after( $chatPanel );
		} else {
			var $target = $( '.mw-diff-ntitle1' ).first();
			if ( $target.length ) {
				$target.append( $chatPanel );
			}
		}
		$chatPanel.show();
	}

	function togglePanel() {
		isOpen = !isOpen;
		var $body = $chatPanel.find( '.cp-chat-body' );
		var $toggle = $chatPanel.find( '.cp-chat-toggle' );
		if ( isOpen ) {
			$body.show();
			$toggle.text( mw.msg( 'collabpatrol-chat-toggle-close' ) );
			loadMessages();
		} else {
			$body.hide();
			$toggle.text( mw.msg( 'collabpatrol-chat-toggle-open' ) );
		}
	}

	function buildComposer() {
		var $composer = $( '<div>' ).addClass( 'cp-chat-composer' );
		var $input = $( '<textarea>' )
			.addClass( 'cp-chat-input' )
			.attr( 'placeholder', mw.msg( 'collabpatrol-chat-placeholder' ) )
			.attr( 'maxlength', MAX_LEN )
			.attr( 'rows', 2 );
		var $counter = $( '<span>' ).addClass( 'cp-chat-char-counter' ).text( '0/' + MAX_LEN );
		var $btn = $( '<button>' )
			.addClass( 'collabpatrol-btn collabpatrol-btn-green cp-chat-send' )
			.text( mw.msg( 'collabpatrol-chat-btn-send' ) );
		var $error = $( '<div>' ).addClass( 'cp-chat-error' ).hide();

		$input.on( 'input', function () {
			var len = $( this ).val().length;
			$counter.text( len + '/' + MAX_LEN );
			if ( len > MAX_LEN ) {
				$counter.addClass( 'cp-chat-char-counter-over' );
			} else {
				$counter.removeClass( 'cp-chat-char-counter-over' );
			}
		} );

		$btn.on( 'click', function () {
			if ( !currentRevId ) {
				return;
			}
			var msg = $input.val().trim();
			if ( !msg ) {
				return;
			}
			if ( msg.length > MAX_LEN ) {
				showError( $error, mw.msg( 'collabpatrol-chat-too-long' ) );
				return;
			}
			$btn.prop( 'disabled', true );
			$error.hide();
			CP.api.chatPost( currentRevId, msg ).then( function ( result ) {
				if ( result && result.result === 'success' ) {
					$input.val( '' );
					$counter.text( '0/' + MAX_LEN );
					loadMessages();
				} else {
					showError( $error, mw.msg( 'collabpatrol-chat-send-error' ) );
				}
			} ).catch( function ( code, data ) {
				var errMsg = mw.msg( 'collabpatrol-chat-send-error' );
				if ( data && data.error && data.error.code === 'banned_word' ) {
					errMsg = mw.msg( 'collabpatrol-chat-banned-word' );
				} else if ( data && data.error && data.error.code === 'message_too_long' ) {
					errMsg = mw.msg( 'collabpatrol-chat-too-long' );
				}
				showError( $error, errMsg );
			} ).always( function () {
				$btn.prop( 'disabled', false );
			} );
		} );

		$input.on( 'keydown', function ( e ) {
			if ( ( e.ctrlKey || e.metaKey ) && e.key === 'Enter' ) {
				$btn.trigger( 'click' );
			}
		} );

		$composer.append( $input, $( '<div>' ).addClass( 'cp-chat-composer-row' ).append( $counter, $btn ), $error );
		return $composer;
	}

	function showError( $el, msg ) {
		$el.text( msg ).show();
		setTimeout( function () {
			$el.fadeOut();
		}, 4000 );
	}


	function loadMessages() {
		if ( !currentRevId ) {
			return;
		}
		CP.api.chatGet( currentRevId ).then( function ( data ) {
			isMod = !!data.isMod;
			var messages = data.messages || [];
			renderMessages( messages );
			updateCount( messages );
		} );
	}

	function renderMessages( messages ) {
		var $messages = $chatPanel.find( '.cp-chat-messages' );
		$messages.empty();

		if ( !messages.length ) {
			$messages.append( $( '<p>' ).addClass( 'cp-chat-empty' ).text( mw.msg( 'collabpatrol-chat-empty' ) ) );
			return;
		}

		messages.forEach( function ( msg ) {
			$messages.append( buildMessageRow( msg ) );
		} );

		$messages.scrollTop( $messages[ 0 ].scrollHeight );
	}

	function buildMessageRow( msg ) {
		var $row = $( '<div>' ).addClass( 'cp-chat-msg' ).attr( 'data-msg-id', msg.id );

		if ( msg.deleted ) {
			$row.addClass( 'cp-chat-msg-deleted' );
			var tombstone = mw.msg( 'collabpatrol-chat-deleted' );
			if ( isMod && msg.deletedBy ) {
				tombstone += ' (' + msg.deletedBy + ')';
			}
			$row.append( $( '<em>' ).text( tombstone ) );
			return $row;
		}

		var elapsed = CP.formatTimeElapsed( CP.now() - msg.timestamp * 1000 );
		var $meta = $( '<span>' ).addClass( 'cp-chat-msg-meta' );

		var userUrl = mw.util.getUrl( 'User:' + msg.userText );
		var $userLink = $( '<a>' ).attr( 'href', userUrl ).addClass( 'cp-chat-msg-user' ).text( msg.userText );
		var $time = $( '<span>' ).addClass( 'cp-chat-msg-time' ).text( elapsed );
		$meta.append( $userLink, ' · ', $time );

		var $text = $( '<span>' ).addClass( 'cp-chat-msg-text' ).text( msg.message );

		$row.append( $meta, $text );

		if ( isMod || msg.userText === CP.userName ) {
			var $del = $( '<button>' )
				.addClass( 'cp-chat-btn-delete' )
				.attr( 'title', mw.msg( 'collabpatrol-chat-btn-delete' ) )
				.text( '✕' )
				.on( 'click', function () {
					if ( !window.confirm( mw.msg( 'collabpatrol-chat-confirm-delete' ) ) ) {
						return;
					}
					CP.api.chatDelete( msg.id ).then( function () {
						loadMessages();
					} );
				} );
			$row.append( $del );
		}

		return $row;
	}

	function updateCount( messages ) {
		var visible = messages.filter( function ( m ) {
			return !m.deleted;
		} ).length;
		$chatPanel.find( '.cp-chat-count' ).text(
			visible > 0 ? mw.msg( 'collabpatrol-chat-count', visible ) : ''
		);
	}


	function startRefresh() {
		stopRefresh();
		refreshTimer = setInterval( function () {
			if ( isOpen ) {
				loadMessages();
			}
		}, CP.config.refreshInterval );
	}

	function stopRefresh() {
		if ( refreshTimer ) {
			clearInterval( refreshTimer );
			refreshTimer = null;
		}
	}


	mw.hook( 'wikipage.content' ).add( function () {
		if ( !CP.getRevId() ) {
			return;
		}
		if ( !$chatPanel ) {
			buildPanel();
		}
	} );

}() );
