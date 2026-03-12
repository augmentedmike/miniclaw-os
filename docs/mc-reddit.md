# mc-reddit — Reddit API Client

Reddit API client with post/comment/voting and subreddit administration.

## What it does

- Reads and writes to Reddit: hot/new/top posts, comments, voting, submit posts
- Manages user profiles and inbox messages
- Subreddit moderation: flairs, rules, sidebar, wiki pages
- Cookie-based authentication (no OAuth) — persists cookies in vault
- Full subreddit setup automation

## CLI

```bash
mc mc-reddit auth --cookies '<str>'             # Save credentials to vault
mc mc-reddit hot [subreddit] [-n limit]         # View hot posts
mc mc-reddit new [subreddit] [-n limit]         # View new posts
mc mc-reddit top [subreddit] [-n limit] [--t]   # View top posts
mc mc-reddit post <subreddit> <postId>          # View a single post
mc mc-reddit comment <fullname> <text>          # Post a comment
mc mc-reddit vote <fullname> <up|down|clear>    # Vote on post/comment
mc mc-reddit submit --sub <r> --title <t>       # Submit a post
mc mc-reddit me                                 # View own profile
mc mc-reddit inbox                              # List inbox messages
mc mc-reddit search <query>                     # Search Reddit
mc mc-reddit setup-subreddit [--sub] [--dry-run]  # Full subreddit setup
mc mc-reddit add-flair --sub <r> --text <t>     # Create flair template
mc mc-reddit add-rule --sub <r> --name <n>      # Add rule
mc mc-reddit set-sidebar --sub <r> --text <md>  # Update sidebar
mc mc-reddit wiki-edit --sub <r> --page <p>     # Edit wiki page
```
