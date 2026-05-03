( function () {
	'use strict';

	var CP = window.CollabPatrol;

	if ( mw.config.get( 'skin' ) !== 'minerva' ) {
		return;
	}

	var MAX_LEN = mw.config.get( 'wgCollabPatrolChatMaxLength' ) || 500;
	var chatRevId = null;
	var isMod = false;
	var isOpen = false;
	var refreshTimer = null;
	var $chatPanel = null;

	function createBtn( label, cls, onClick ) {
		return $( '<button>' )
			.addClass( 'collabpatrol-m-btn collabpatrol-m-btn-' + cls )
			.text( label )
			.on( 'click', onClick );
	}

	function buildChat( revId ) {
		$chatPanel = $( '<div>' ).addClass( 'collabpatrol-m-chat' );

		var $header = $( '<div>' ).addClass( 'collabpatrol-m-chat-header' );
		var $title = $( '<span>' ).addClass( 'collabpatrol-m-chat-title' )
			.text( '💬 ' + mw.msg( 'collabpatrol-chat-title' ) );
		var $count = $( '<span>' ).addClass( 'collabpatrol-m-chat-count' );
		var $toggle = $( '<button>' ).addClass( 'collabpatrol-m-chat-toggle' )
			.text( mw.msg( 'collabpatrol-chat-toggle-open' ) )
			.on( 'click', function () {
				toggleChat();
			} );
		$header.append( $title, $count, $toggle );

		var $body = $( '<div>' ).addClass( 'collabpatrol-m-chat-body' ).hide();
		var $messages = $( '<div>' ).addClass( 'collabpatrol-m-chat-messages' );
		var $composer = buildComposer( revId );
		$body.append( $messages, $composer );

		$chatPanel.append( $header, $body );

		loadMessages( revId );
		startRefresh( revId );

		return $chatPanel;
	}

	function toggleChat() {
		isOpen = !isOpen;
		var $body = $chatPanel.find( '.collabpatrol-m-chat-body' );
		var $toggle = $chatPanel.find( '.collabpatrol-m-chat-toggle' );
		if ( isOpen ) {
			$body.show();
			$toggle.text( mw.msg( 'collabpatrol-chat-toggle-close' ) );
			loadMessages( chatRevId );
		} else {
			$body.hide();
			$toggle.text( mw.msg( 'collabpatrol-chat-toggle-open' ) );
		}
	}

	function buildComposer( revId ) {
		var $composer = $( '<div>' ).addClass( 'collabpatrol-m-chat-composer' );

		var $input = $( '<textarea>' )
			.addClass( 'collabpatrol-m-chat-input' )
			.attr( 'placeholder', mw.msg( 'collabpatrol-chat-placeholder' ) )
			.attr( 'maxlength', MAX_LEN )
			.attr( 'rows', 2 );

		var $counter = $( '<span>' ).addClass( 'collabpatrol-m-chat-counter' ).text( '0/' + MAX_LEN );

		var $btn = createBtn( mw.msg( 'collabpatrol-chat-btn-send' ), 'green', function () {
			var msg = $input.val().trim();
			if ( !msg || msg.length > MAX_LEN ) {
				return;
			}
			$btn.prop( 'disabled', true );
			CP.api.chatPost( revId, msg ).then( function ( result ) {
				if ( result && result.result === 'success' ) {
					$input.val( '' );
					$counter.text( '0/' + MAX_LEN );
					loadMessages( revId );
				}
			} ).always( function () {
				$btn.prop( 'disabled', false );
			} );
		} );

		$input.on( 'input', function () {
			var len = $( this ).val().length;
			$counter.text( len + '/' + MAX_LEN );
			if ( len > MAX_LEN ) {
				$counter.addClass( 'collabpatrol-m-chat-counter-over' );
			} else {
				$counter.removeClass( 'collabpatrol-m-chat-counter-over' );
			}
		} );

		$input.on( 'keydown', function ( e ) {
			if ( ( e.ctrlKey || e.metaKey ) && e.key === 'Enter' ) {
				$btn.trigger( 'click' );
			}
		} );

		$composer.append(
			$input,
			$( '<div>' ).addClass( 'collabpatrol-m-chat-composer-row' ).append( $counter, $btn )
		);
		return $composer;
	}

	function loadMessages( revId ) {
		CP.api.chatGet( revId ).then( function ( data ) {
			isMod = !!data.isMod;
			var messages = data.messages || [];
			updateCount( messages );
			if ( isOpen ) {
				renderMessages( revId, messages );
			}
		} );
	}

	function renderMessages( revId, messages ) {
		var $messages = $chatPanel.find( '.collabpatrol-m-chat-messages' );
		$messages.empty();

		if ( !messages.length ) {
			$messages.append(
				$( '<p>' ).addClass( 'collabpatrol-m-chat-empty' )
					.text( mw.msg( 'collabpatrol-chat-empty' ) )
			);
			return;
		}

		messages.forEach( function ( msg ) {
			$messages.append( buildMessageRow( revId, msg ) );
		} );

		$messages.scrollTop( $messages[ 0 ].scrollHeight );
	}

	function buildMessageRow( revId, msg ) {
		var $row = $( '<div>' ).addClass( 'collabpatrol-m-chat-msg' );

		if ( msg.deleted ) {
			var tombstone = mw.msg( 'collabpatrol-chat-deleted' );
			if ( isMod && msg.deletedBy ) {
				tombstone += ' (' + msg.deletedBy + ')';
			}
			$row.addClass( 'collabpatrol-m-chat-msg-deleted' )
				.append( $( '<em>' ).text( tombstone ) );
			return $row;
		}

		var elapsed = CP.formatTimeElapsed( CP.now() - msg.timestamp * 1000 );

		var userUrl = mw.util.getUrl( 'User:' + msg.userText );
		var $user = $( '<a>' ).attr( 'href', userUrl )
			.addClass( 'collabpatrol-m-chat-user' ).text( msg.userText );
		var $time = $( '<span>' ).addClass( 'collabpatrol-m-chat-time' ).text( ' · ' + elapsed );
		var $meta = $( '<div>' ).addClass( 'collabpatrol-m-chat-meta' ).append( $user, $time );
		var $text = $( '<div>' ).addClass( 'collabpatrol-m-chat-text' ).text( msg.message );

		$row.append( $meta, $text );

		if ( isMod || msg.userText === CP.userName ) {
			var $del = $( '<button>' )
				.addClass( 'collabpatrol-m-chat-btn-delete' )
				.attr( 'title', mw.msg( 'collabpatrol-chat-btn-delete' ) )
				.text( '✕' )
				.on( 'click', function () {
					if ( !window.confirm( mw.msg( 'collabpatrol-chat-confirm-delete' ) ) ) {
						return;
					}
					CP.api.chatDelete( msg.id ).then( function () {
						loadMessages( revId );
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
		$chatPanel.find( '.collabpatrol-m-chat-count' ).text(
			visible > 0 ? mw.msg( 'collabpatrol-chat-count', visible ) : ''
		);
	}

	function startRefresh( revId ) {
		stopRefresh();
		refreshTimer = setInterval( function () {
			if ( isOpen ) {
				loadMessages( revId );
			}
		}, CP.config.refreshInterval );
	}

	function stopRefresh() {
		if ( refreshTimer ) {
			clearInterval( refreshTimer );
			refreshTimer = null;
		}
	}

	function renderInterface() {
		var revId = CP.getRevId();
		if ( !revId ) {
			return;
		}

		CP.api.getEntry( revId ).then( function ( entry ) {
			$( '.collabpatrol-m-container' ).remove();
			stopRefresh();
			$chatPanel = null;
			isOpen = false;

			var target = $( '.content, #mw-content-text' ).first();
			if ( !target.length ) {
				return;
			}

			var container = $( '<div>' ).addClass( 'collabpatrol-m-container' );
			var row = $( '<div>' ).addClass( 'collabpatrol-m-row' );

			if ( !entry ) {
				if ( !CP.isUnpatrolled() ) {
					return;
				}
				row.append( createBtn( '⏳ ' + mw.msg( 'collabpatrol-btn-flag' ), 'yellow', function () {
					var comment = window.prompt( mw.msg( 'collabpatrol-comment-placeholder' ), '' );
					if ( comment === null ) {
						return;
					}
					CP.api.setStatus( revId, 'pending', comment ).then( renderInterface );
				} ) );
			} else {
				var elapsed = CP.now() - entry.timestamp * 1000;
				var isUrgent = entry.status === 'pending' && elapsed > CP.config.urgencyThreshold;

				var badgeCls = 'collabpatrol-m-badge ';
				if ( entry.status === 'pending' ) {
					badgeCls += isUrgent ? 'collabpatrol-m-badge-urgent' : 'collabpatrol-m-badge-pending';
				} else if ( entry.status === 'in_progress' ) {
					badgeCls += 'collabpatrol-m-badge-progress';
				} else {
					badgeCls += 'collabpatrol-m-badge-finished';
				}

				var emoji = entry.status === 'pending' ? '⏳' : entry.status === 'in_progress' ? '🔄' : '✅';
				var badgeText = emoji + ' ' + entry.userText;
				if ( entry.comment ) {
					badgeText += ' • ' + entry.comment;
				}

				row.append( $( '<span>' ).addClass( badgeCls ).text( badgeText ) );
				row.append( $( '<span>' ).addClass( 'collabpatrol-m-time' ).text( CP.formatTimeElapsed( elapsed ) ) );

				if ( entry.status === 'pending' ) {
					row.append( createBtn( mw.msg( 'collabpatrol-btn-take' ), 'green', function () {
						CP.api.setStatus( revId, 'in_progress', entry.comment ).then( renderInterface );
					} ) );
				} else if ( entry.status === 'in_progress' ) {
					row.append( createBtn( mw.msg( 'collabpatrol-btn-finish' ), 'green', function () {
						CP.api.setStatus( revId, 'finished', entry.comment ).then( function () {
							mw.notify( mw.msg( 'collabpatrol-notify-patrolled' ) );
							renderInterface();
						} );
					} ) );
				}

				if ( CP.config.isAdmin || entry.userText === CP.userName ) {
					row.append( createBtn( '✕', 'grey', function () {
						if ( !window.confirm( mw.msg( 'collabpatrol-confirm-remove' ) ) ) {
							return;
						}
						CP.api.removeEntry( revId ).then( renderInterface );
					} ) );
				}

				container.append( row );

				if ( entry.history && entry.history.length > 1 ) {
					var histDiv = $( '<div>' ).addClass( 'collabpatrol-m-history' );
					entry.history.forEach( function ( h ) {
						var hElapsed = CP.now() - h.timestamp * 1000;
						var hEmoji = h.action === 'pending' ? '⏳' : h.action === 'in_progress' ? '🔄' : '✅';
						var hText = hEmoji + ' ' + h.userText + ' ' + CP.formatTimeElapsed( hElapsed );
						if ( h.comment ) {
							hText += ' • ' + h.comment;
						}
						histDiv.append( $( '<div>' ).addClass( 'collabpatrol-m-history-item' ).text( hText ) );
					} );
					container.append( histDiv );
				}

				if ( entry.status !== 'finished' && mw.config.get( 'wgCollabPatrolChatEnabled' ) ) {
					chatRevId = revId;
					container.append( buildChat( revId ) );
				}

				target.prepend( container );
				return;
			}

			container.append( row );
			target.prepend( container );
		} );
	}

	mw.hook( 'wikipage.content' ).add( function () {
		if ( CP.getRevId() ) {
			renderInterface();
		}
	} );

}() );