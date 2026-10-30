# Ham Radio Lookup

Ham Radio Lookup is an Electron app for searching United States amateur radio licenses. It reads either a MySQL database or a SQLite file built from the FCC Universal Licensing System amateur file and the RadioID DMR user list. Searches run on your computer. The app does not send a query to a server.

The window is titled **Ham Radio Lookup**. On macOS, settings can still use the legacy preference and Keychain identity `us.ds6.HamRadioQuery` from the earlier native [Swift/SwiftUI macOS app](https://github.com/deverl/ham_radio_query).

## What you can look up

Each result is one license record:

| Column | Meaning |
| --- | --- |
| Call Sign | The station call sign |
| First Name, Last Name, Street Address, City, State, ZIP | The licensee's name and mailing address |
| Operator Class | Amateur Extra, Advanced, General, Technician, Technician Plus, or Novice |
| License Status | Active, Canceled, Expired, Terminated, Term Pending, Pending Legal Status, or Parent Station Canceled |
| FRN | The FCC Registration Number |
| Region Code | The FCC region stored with the amateur record |
| DMR ID | The RadioID DMR ID for that call sign, or a dash when RadioID has none |

Operator class and license status are stored as the FCC's single-letter codes and shown as the full names above. A status other than Active is drawn in a secondary color.

## Requirements

- An internet connection the first time you create the database, and again whenever you update it
- Node.js 22 or newer, if you are building the app yourself
- MySQL or MariaDB, only if you choose MySQL instead of the built-in SQLite file
- On Linux, the packages listed under [Linux setup](#linux-setup-ubuntu--debian)

The license file is about 190 MB. Building the database also downloads the RadioID user list and can take several minutes.

## Choose MySQL or SQLite

Search uses one database at a time. Open **Settings** (**Ham Radio Lookup > Settings…**, or **Ctrl+,** / **Command+,**) or click **Database** in the toolbar. At the top of that window, **Database** is a pair of radio buttons: **SQLite** and **MySQL**. The choice is saved, and the next search uses it.

**SQLite** is the default. The license data lives in a file on this computer, so no database server is required. The settings window shows the file path and the last time it was built. **Create Database…** or **Update Database…** downloads the FCC and RadioID files and builds that file. Search stays disabled until the file exists.

**MySQL** reads and updates a MySQL or MariaDB server. Choosing it shows the connection fields:

| Field | Local default |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `3306` |
| Database | `fcc` |
| Username | `fccuser` |
| Password | `fccuser` |

**Use Local Defaults** fills in those values. They match the local database used by the FCC web app in the sibling `fcc` project. Change them if your server is elsewhere or uses a different account.

**Test Connection** tries the host, port, database, username, and password currently on screen. It does not save them. A successful test says which database it reached. A failure names the connection problem, such as a server that is not running, a rejected password, or a database name that does not exist.

**Save** stores the host, port, database name, and username. On macOS the password is stored in the Keychain. On Linux and Windows the password is stored in the app settings file. Until you save, a successful test applies only to that test. Searches use the saved connection.

**Update Database…** downloads the FCC and RadioID files and rebuilds the license tables in the saved MySQL database. The database is created if that account is allowed to create it. This step needs the `mysql` command-line client. Search itself does not need that client. If the server is not running, the search says it could not connect.

## Create or update the database

The app does not include license data.

With **SQLite** selected, the first launch says the database has not been created, and **Search** stays disabled until one exists. Create it from the main window, from **Tools > Create License Database…**, or from **Create Database…** in Settings. The finished file is installed only after the import succeeds, so a failed update leaves the previous file in place. If the file is more than 8 days old, the app asks you to update it, and search still works.

With **MySQL** selected, save the connection first, then use **Update Database…** in Settings or **Tools > Update License Database…**. That rebuilds the license tables in the MySQL database named in Settings. Search stays available while you do this.

Either choice downloads the same files:

1. `l_amat.zip` from the FCC (`https://data.fcc.gov/download/pub/uls/complete/l_amat.zip`)
2. The license files inside that archive
3. `user.csv` from RadioID (`https://radioid.net/static/user.csv`)

You can cancel while a download is in progress. Import cannot be cancelled. Downloaded files stay in the download directory (see [Where files are stored](#where-files-are-stored)) until the next create or update removes that folder and downloads fresh copies. Expect a few gigabytes of free disk space for the zip, extracted `.dat` files, and the SQLite database.

## Search

Enter at least one of call sign, first name, last name, city, or state, then click **Search** or press Return.

- **Call sign** matches the whole call sign. Typing is uppercased. `w7dns` finds `W7DNS` and does not find other call signs that merely contain those letters.
- **First name**, **last name**, and **city** match from the start. `Em` matches Emmett. A name or city must begin with what you typed.
- **State** matches the two-letter abbreviation exactly. `id` is treated as `ID`.
- `%` and `_` in a name or city are ordinary characters, not wildcards.

**Clear** resets the fields, the options, and the results.

If every field is blank, Search asks you to enter a call sign, name, city, or state.

### Options

**Options** is collapsed until you open it.

**License Status** defaults to Active only. Turn on other statuses to include them. If none are selected, every status matches.

**Operator Class** defaults to all classes. If none are selected, every class matches.

**Apply Title Case** capitalizes names, street addresses, and cities in the results. Call signs, state, ZIP, FRN, region, and DMR ID are unchanged. Turn it off to see the FCC's original capitalization.

## Results

Results are ordered by last name, then first name. Click a column header to sort by that column instead.

**Filter results** narrows the rows already on screen. It matches any visible column, and it also matches the one-letter operator class and license status codes as well as their full names. **Ctrl+F** / **Command+F** moves the cursor to that field. The status line shows how many rows are visible. This filter does not search the database again.

Select rows and use the context menu, or:

| Action | Menu | Shortcut |
| --- | --- | --- |
| Copy the selected rows as tab-separated text, with a header | Edit > Copy Selected Rows | Ctrl+Shift+C / Command+Shift+C |
| Export the rows currently shown as CSV | File > Export Results…, or the Export toolbar button | Ctrl+Shift+E / Command+Shift+E |
| Look up one row's call sign | Double-click the row, or choose Search This Call Sign | |

Copy and export use the full operator class and license status names. The suggested CSV name is `Ham Radio Lookup`. Export includes the filtered rows, so a filter changes what is written.

Double-clicking a row, or choosing **Search This Call Sign**, puts that call sign in the search field, clears the name, city, and state, and searches again. That action applies to one row.

## Where files are stored

| File | macOS | Linux |
| --- | --- | --- |
| SQLite license database | `~/Library/Application Support/Ham Radio Query/licenses.sqlite` | `~/.config/Ham Radio Query/licenses.sqlite` |
| App settings | Electron `userData` | `~/.config/ham-radio-lookup/settings.json` |
| MySQL password | Keychain item for `us.ds6.HamRadioQuery` | Stored in `settings.json` |
| FCC and RadioID downloads | `/tmp/ham-radio-lookup` | `~/.cache/ham-radio-lookup` |

The SQLite folder is created when the first SQLite import succeeds. Deleting `licenses.sqlite` makes the app treat that file as missing. The age check uses the import time stored inside the file, not the file's modification date. The MySQL database stays on the server you configured.

On Linux, downloads are kept under `~/.cache` because `/tmp` is often a small RAM disk.

## Linux setup (Ubuntu / Debian)

These instructions cover building the Linux package from this repository and installing it as a desktop app.

### Required packages

Install the system tools the build and the in-app database updater need:

```bash
sudo apt update
sudo apt install -y \
  curl \
  unzip \
  sqlite3 \
  git \
  ca-certificates \
  build-essential
```

| Package | Why it is needed |
| --- | --- |
| `curl` | Downloads the Electron binary during `npm run install:electron` |
| `unzip` | Extracts Electron, and extracts the FCC `l_amat.zip` when creating/updating the license database |
| `sqlite3` | Builds and refreshes the local SQLite license database from FCC / RadioID files |
| `git` | Clones this repository |
| `ca-certificates` | TLS for downloads from GitHub, FCC, and RadioID |
| `build-essential` | Compiles native npm dependencies when needed |

Also install **Node.js 22 or newer** (includes `npm`). Example with [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22
nvm use 22
node -v   # should be v22+
npm -v
```

A normal Ubuntu desktop already has the GTK / NSS libraries Electron needs. On a minimal install, also add:

```bash
sudo apt install -y \
  libgtk-3-0 \
  libnss3 \
  libxss1 \
  libasound2t64 \
  libgbm1 \
  xdg-utils
```

### Optional: MySQL / MariaDB

SQLite is the default engine. If you prefer MySQL in Settings, install a client (and a server, if you do not already have one):

```bash
sudo apt install -y mariadb-client
# optional local server:
# sudo apt install -y mariadb-server
```

### Install the desktop app

From a clone of this repository, run the install script that matches the machine:

```bash
git clone https://github.com/deverl/ham_radio_lookup.git
cd ham_radio_lookup
./scripts/install-linux-arm64.sh   # ARM64
./scripts/install-linux-x64.sh     # x64
```

The install script will:

1. Confirm it is running from the `ham_radio_lookup` project
2. Build `dist/Ham Radio Lookup-linux-arm64` or `dist/Ham Radio Lookup-linux-x64` if that directory is missing (`npm install`, Electron download, then the matching `npm run pack:linux-*`)
3. Install a desktop entry at `~/.local/share/applications/ham-radio-lookup.desktop`
4. Copy the packaged app to `~/.local/share/applications/ham-radio-lookup/`
5. Install icons under `~/.local/share/ham-radio-lookup/icons/`

After it finishes, launch **Ham Radio Lookup** from your app menu, or run:

```bash
~/.local/share/applications/ham-radio-lookup/ham-radio-lookup.sh
```

### Uninstall the desktop app

```bash
./scripts/uninstall-linux.sh
```

That removes the desktop entry, the copied app under `~/.local/share/applications/ham-radio-lookup/`, and the installed icons. It leaves settings, the SQLite database, and FCC download cache in place (see [Where files are stored](#where-files-are-stored)).

### Manual build (optional)

If you only want to package the app without installing the desktop entry, follow [Build packages](#build-packages) and run `npm run pack:linux-arm64` (or `pack:linux-x64` on an x64 machine).

## Helper scripts

| Script | Purpose |
| --- | --- |
| `scripts/install-linux-arm64.sh` | Build the Linux arm64 package if needed, then install the desktop app and icons |
| `scripts/install-linux-x64.sh` | Build the Linux x64 package if needed, then install the desktop app and icons |
| `scripts/uninstall-linux.sh` | Remove the desktop entry, installed app directory, and icons |
| `scripts/clean.sh` | Delete derived project files: `dist/`, `node_modules/`, `.electron-download/`, `.electron-cache/`, and `.DS_Store` |

Run them from a clone of this repository:

```bash
./scripts/install-linux-arm64.sh
./scripts/install-linux-x64.sh
./scripts/uninstall-linux.sh
./scripts/clean.sh
```

`clean.sh` does not remove `./build` (committed app icons) or user data under `~/.config` / `~/.cache`. After a clean, run `npm install --include=dev --ignore-scripts` and `npm run install:electron` again before packaging or starting the app.

## Build and run (development)

```bash
npm install --include=dev --ignore-scripts
npm run install:electron
npm start
```

`npm run install:electron` downloads the Electron binary for the machine you are on (needed for `npm start` and for Linux packaging).

Unit tests:

```bash
npm test
```

The tests build a small temporary SQLite file. They do not download the FCC archive and they do not write the Application Support / config database.

## Build packages

Each pack script writes a runnable app under `dist/`. Distribute that whole folder (or `.app` on macOS); Electron needs its libraries and `resources/` beside the main executable.

Shared setup on the build machine:

```bash
npm install --include=dev --ignore-scripts
npm run install:electron
```

You need network access the first time so Electron binaries can be downloaded. macOS and Windows packs let `@electron/packager` fetch the target Electron build. Linux packs use the zip in `.electron-download` produced by `install:electron`, so build Linux on a machine whose architecture matches the package you want (or place the matching `electron-v*-linux-*.zip` in `.electron-download` yourself).

### macOS (Apple silicon)

```bash
npm run pack:mac
```

| | |
| --- | --- |
| Script | `pack:mac` |
| Target | macOS arm64 |
| Output | `dist/Ham Radio Lookup-darwin-arm64/Ham Radio Lookup.app` |
| Notes | Sets bundle id `us.ds6.HamRadioLookup` and uses `build/icon.png` |

### Windows

```bash
npm run pack:win-x64
npm run pack:win-arm64
```

| Script | Target | Output |
| --- | --- | --- |
| `pack:win-x64` | Windows x64 | `dist/Ham Radio Lookup-win32-x64/` |
| `pack:win-arm64` | Windows arm64 | `dist/Ham Radio Lookup-win32-arm64/` |

Both use `build/icon.png`. Run the `.exe` inside the output folder; ship the entire folder.

### Linux

```bash
npm run pack:linux-x64
npm run pack:linux-arm64
```

| Script | Target | Output |
| --- | --- | --- |
| `pack:linux-x64` | Linux x64 | `dist/Ham Radio Lookup-linux-x64/` |
| `pack:linux-arm64` | Linux arm64 | `dist/Ham Radio Lookup-linux-arm64/` |

These scripts also write a small launcher shell script named `Ham Radio Lookup` that starts the real binary with `--no-sandbox` (needed when the packaged app is copied to another machine). On Ubuntu you can then install the desktop entry with `./scripts/install-linux-arm64.sh` or `./scripts/install-linux-x64.sh`.
