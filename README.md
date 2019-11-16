## Heroku setup

Add Puppeteer buildpack:

```
heroku buildpacks:add jontewks/puppeteer
```

Set config vars:

Name | Description
--- | ---
`EMAIL` | login email for CBS Fantasy
`PASSWORD` | login password for CBS Fantasy
`SLACK_API_TOKEN` | API token for Slack

## Slack setup

The app will post to a channel called `#basketball` if it is available. Otherwise, the app will post to the first channel it can find in which the authorizing user is a member.
