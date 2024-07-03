const fs = require("fs");
const https = require("https");
const Stream = require("stream").Transform;
const SpotifyWebApi = require("spotify-web-api-node");
const Youtube = require("youtube-sr").default;
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const NodeID3 = require('node-id3')
const path = require("path");

const deleteForbidDirChars = require("./deleteForbidChar")

// Downloader
class MusicDownloader {
    constructor(creds, workingDir) {
        return new Promise((resolve, reject) => {
            if (!creds) reject(`Credentials not provided`);
            if (!workingDir) reject(`Working directory not provided`);
            this.creds = creds;
            this.workingDir = workingDir;
            this.spotify = new SpotifyWebApi(creds);
            this.spotify.clientCredentialsGrant().then((data) => {
                this.spotify.setAccessToken(data.body.access_token);
                if (!fs.existsSync(path.join(this.workingDir, ".youtify"))) fs.mkdirSync(path.join(this.workingDir, ".youtify"))
                resolve(this);
            }, (err) => {
                reject(`Error retrieving access token: ${err.message}`);
            });
        });
    }

    download = (options) => {
        return this.downloadOptions[options.type](options.value);
    }

    downloadOptions = {
        "url": (url) => {
            return this.downloadFromUrl(url);
        },
        "search": (query) => {
            return this.downloadFromSearch(query);
        }
    }

    downloadFromSearch = (query) => {
        return new Promise((resolve, reject) => {
            this.spotify.searchTracks(query)
            .then((spotSearchData) => {
                // sort by popularity
                spotSearchData.body.tracks.items.sort(function(a, b){return b.popularity - a.popularity});
                let track = spotSearchData.body.tracks.items[0];
                // download from url
                this.downloadFromUrl(track.external_urls.spotify, track)
                .then((data) => {
                    resolve(data);
                }, (err) => {
                    reject(err);
                });
            }, (err) => {
                reject(`Error downloading ${query}: ${err}`)
            });
        });
    }

    downloadFromUrl = (url, track) => {
        return new Promise((resolve, reject) => {
            if (url.split('/')[3] !== "track") {
                reject(`Error downloading ${url}: only download tracks!`);
            }
            let album;
            let install = () => {
                let query = {
                    "track": track.name,
                    "artist": track.artists[0].name
                }
                let fileName = deleteForbidDirChars(`${track.name}`);
                let imageName = deleteForbidDirChars(`${track.album.name} - ${query.artist}`);
                // begin download from YouTube
                console.log(`Downloading ${query.track} by ${query.artist}...`);
                this.downloadFromYoutube(`${query.artist} - ${query.track}`)
                .then((audio) => {
                    // convert audio
                    this.convertAudio(audio, `${path.join(this.workingDir, fileName)}.mp3`)
                    .then(() => {
                        // download thumbnail
                        this.downloadImage(track.album.images[0].url, `${path.join(this.workingDir, ".youtify", imageName)}.jpg`)
                        .then(() => {
                            metadata(query);
                        }, (err) => {
                            metadata(query);
                            console.log(err);
                        });
                    }, (err) => {
                        reject(`Error downloading ${query.track} by ${query.artist}: ${err}`);
                    });
                }, (err) => {
                    reject(err);
                });
            }

            // apply metadata
            let metadata = (query) => {
                let fileName = deleteForbidDirChars(`${track.name}`);
                let imageName = deleteForbidDirChars(`${track.album.name} - ${query.artist}`);
                this.applyMetadata({
                    track: track,
                    album: album,
                    filePath: `${path.join(this.workingDir, fileName)}.mp3`,
                    imagePath: `${path.join(this.workingDir, ".youtify", imageName)}.jpg`
                })
                .then(() => {
                    resolve(`Done`);
                }, (err) => {
                    reject(err);
                });
            }

            let begin = () => {
                this.spotify.getAlbum(track.album.id).then((albumData) => {
                    album = albumData.body;
                }, (err) => {
                    console.error(err);
                });
                install();
            }

            if (!track) {
                // get info
                let id = url.split('/')[4];
                this.spotify.getTrack(id).then((trackData) => {
                    track = trackData.body;
                    begin();
                }, (err) => {
                    reject(`Error downloading ${url}: ${err}`);
                });
            } else begin();
        });
    }

    downloadFromYoutube = (query) => {
        return new Promise((resolve, reject) => {
            let ytSearch = Youtube.searchOne(query);
            ytSearch.then((ytSearchData) => {
                let audio = ytdl(ytSearchData.url, { filter: "audioonly", quality: "highestaudio" });
                resolve(audio);
            }, (err) => {
                reject(`Error downloading from YouTube ${query}: ${err}`);
            });
        });
    }

    convertAudio = (audio, path) => {
        return new Promise((resolve, reject) => {
            ffmpeg(audio)
            .audioBitrate(356)
            .toFormat("mp3")
            .on("error", (err) => {
                reject(`Error converting ${path}: ${err}`);
            })
            .on("end", () => {
                resolve();
            })
            .save(path);
        });
    }

    applyMetadata = (options) => {
        return new Promise((resolve, reject) => {
            let track = options.track;
            let album = options.album;
            let filePath = options.filePath;
            let imagePath = options.imagePath;
            let artists = track.artists;
            let release = track.album.release_date.split("-");
            // create track metadata
            let metadata = {
                TPE1: "",
                TCON: album.genres,
                TIT2: track.name,
                TALB: track.album.name,
                TPE2: track.album.artists[0].name,
                TRCK: track.track_number,
                TPOS: track.disc_number,
                TPUB: album.label,
                TMED: "MP3",
                TCOP: album.copyrights[0].text,
                WCOP: album.copyrights[0].text,
                WOAF: track.external_urls.spotify,
                WOAR: artists[0].external_urls.spotify,
                WOAS: track.external_urls.spotify,
                TLEN: track.duration_ms,
                TDAT: `${release[1]}${release[2]}`,
                TYER: release[0],
    
            };
            // thumbnail only if image path specified
            if (fs.existsSync(imagePath)) {
                metadata.APIC = imagePath;
            }
            // add contributing artists
            for (let i = 0; i < artists.length; i++) {
                metadata.TPE1 += `${artists[i].name}`;
                if (i < artists.length - 1) {
                    metadata.TPE1 += `; `;
                }
            }

            // write track metadata
            const success = NodeID3.write(metadata, filePath);
            resolve();
        });
    }

    downloadImage = (url, path) => {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(path)) {
                resolve();
            }
            try {
                https.request(url, function(response) {
                    let data = new Stream();
                    response.on("data", function(chunk) {
                        data.push(chunk);
                    });
                    response.on("end", function() {
                        fs.writeFileSync(path, data.read());
                        resolve();
                    });
                }).end();
            } catch (err) {
                reject(`Error downloading image ${path}: ${err}`);
            }
        });
    }
}

module.exports = MusicDownloader;