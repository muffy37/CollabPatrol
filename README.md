# CollabPatrol

CollabPatrol is a MediaWiki extension that brings collaborative revision patrolling to your wiki. It started as a JavaScript gadget for the [Vikidia](https://en.vikidia.org) project and has since grown into a full extension, available for any MediaWiki wiki.

The idea is simple: instead of patrolling alone, patrollers can flag a revision they are unsure about, so other patrollers know it needs a second look. Flagged revisions are highlighted in Recent Changes, making the workload visible to the whole team.

## Requirements

- MediaWiki 1.43 or later
- PHP 8.1 or later
- A user group with the `patrol` right (e.g. `patroller`, `sysop`)

## Installation

1. Download and place the `CollabPatrol` folder in your `extensions/` directory (see the releases page).
2. Add the following line to your `LocalSettings.php`:
   ```php
   wfLoadExtension( 'CollabPatrol' );
   ```
3. Run the database update script:
   ```bash
   php maintenance/run.php update
   ```
4. Done — navigate to `Special:Version` to confirm the extension is loaded.

## Permissions

| Right | Default groups | Description |
|---|---|---|
| `collabpatrol-use` | `patroller`, `sysop` | Flag, take and finish patrol entries |
| `collabpatrol-admin` | `sysop` | Manage entries and moderate the chat |

You can override these in `LocalSettings.php`:
```php
$wgGroupPermissions['patroller']['collabpatrol-use'] = true;
$wgGroupPermissions['sysop']['collabpatrol-admin'] = true;
```

## Configuration

All settings go in `LocalSettings.php`.

| Variable | Default | Description |
|---|---|---|
| `$wgCollabPatrolExpirationDelay` | `172800` (48 h) | Seconds before a patrol entry expires automatically |
| `$wgCollabPatrolUrgencyThreshold` | `3600` (1 h) | Seconds before a pending entry is marked urgent |
| `$wgCollabPatrolAutoPatrol` | `true` | Automatically mark the revision as patrolled when status is set to *finished* |
| `$wgCollabPatrolEnableEcho` | `true` | Send Echo notifications when patrol status changes |
| `$wgCollabPatrolChatEnabled` | `true` | Enable the per-diff discussion panel |
| `$wgCollabPatrolChatMaxLength` | `500` | Maximum character length for a chat message |
| `$wgCollabPatrolChatModerators` | `[]` | Additional usernames allowed to delete chat messages |
| `$wgCollabPatrolChatBannedWords` | `[]` | Words forbidden in chat messages (case-insensitive) |
| `$wgCollabPatrolChatAutoDelete` | `true` | Delete chat messages when the entry is finished or removed |

Example:
```php
$wgCollabPatrolUrgencyThreshold = 1800; // flag as urgent after 30 minutes
$wgCollabPatrolChatBannedWords = [ 'spam', 'badword' ];
$wgCollabPatrolChatModerators = [ 'Alice', 'Bob' ];
```

## How it works

1. A patroller views a diff and is unsure about the revision.
2. They click **Flag** and optionally pick a reason (vandalism, complex edit, needs sourcing…).
3. The revision appears with a marker in Recent Changes so other patrollers can see it.
4. Another patroller clicks **Take** to signal they are looking at it, then **Finish** once done.
5. If `$wgCollabPatrolAutoPatrol` is enabled, finishing also marks the revision as patrolled in MediaWiki.

A discussion panel is available on each flagged diff, allowing patrollers to leave short notes for each other.

The dashboard at `Special:CollabPatrol` shows all active entries, their status, and patroller statistics.

## License

[GPL-2.0-or-later](LICENSE)
