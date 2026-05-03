( function () {
	'use strict';

	var CP = window.CollabPatrol;

	if ( mw.config.get( 'skin' ) !== 'minerva' ) {
		return;
	}

	function createBtn( label, cls, onClick ) {
		return $( '<button>' )
			.addClass( 'collabpatrol-m-btn collabpatrol-m-btn-' + cls )
			.text( label )
			.on( 'click', onClick );
	}

	function renderInterface() {
		var revId = CP.getRevId();
		if ( !revId ) {
			return;
		}

		CP.api.getEntry( revId ).then( function ( entry ) {
			$( '.collabpatrol-m-container' ).remove();

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
					container.append( row );
					container.append( histDiv );
					target.prepend( container );
					return;
				}
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
