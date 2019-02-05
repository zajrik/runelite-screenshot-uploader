# Runelite Screenshot Uploader
- Can be run continuously to continue uploading screenshots as they are taken,
  or run manually to upload all new screenshots and exit.
- Expects to only be in a single server that it will utilize for uploading all
  screenshots in the Runelite screenshots directory.
- Expects a `config.json` file in the `bin/` directory (or `src/` before building)
  with the following information:

  ```json
  {
  	"token": "Discord bot token",
  	"username": "Runescape username present on the screenshot directory"
  }
  ```


# Building
- Make sure to provide a `config.json` in the `src/` directory
- Run `npm run build`
  - Alternatively, run the `build.bat` script

# Running
- `npm run run` or `npm run runOnce`.
  - Alternatively, run `run.bat` or `runOnce.bat`
