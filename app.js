const Discord = require("discord.js");
const { MessageEmbed } = require("discord.js");
require("dotenv").config();
const { prefix } = require("./config.json");
const ytdl = require("ytdl-core");
const searchPlaylist = require("youtube-search-api");

const search = require("youtube-search");

const client = new Discord.Client();
client.login(process.env.token);

client.once("ready", () => {
    console.log("Ready!");
});

client.once("reconnecting", () => {
    console.log("Reconnecting!");
});

client.once("disconnect", () => {
    console.log("Disconnect!");
});

client.on("message", async message => {
    if (message.author.bot) return;

    if (!message.content.startsWith(prefix)) return;

    const serverQueue = queue.get(message.guild.id);

    if (message.content.startsWith(`${prefix}play`)) {
        execute(message, serverQueue);
        return;
    } else if (
        message.content.startsWith(`${prefix}skipTo`) ||
        message.content.startsWith(`${prefix}skipto`)
    ) {
        skipTo(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}skip`)) {
        skip(message, serverQueue);
        return;
    } else if (
        message.content.startsWith(`${prefix}stop`) ||
        message.content.startsWith(`${prefix}disconnect`)
    ) {
        stop(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}shuffle`)) {
        shuffle(message, serverQueue);
        return;
    } else if (
        message.content.startsWith(`${prefix}queue`) ||
        message.content.startsWith(`${prefix}playlist`)
    ) {
        status(message, serverQueue);
        return;
    } else {
        message.channel.send("You need to enter a valid command!");
    }
});

const queue = new Map();
let playMsg;

async function execute(message, serverQueue) {
    const args = message.content.split(" ");

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
        return message.channel.send("You need to be in a voice channel to play music!");
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
            "I need the permissions to join and speak in your voice channel!"
        );
    }

    const msg = args[1];

    let song, songs;

    if (msg.includes("playlist?list=")) {
        const params = msg.split("https://www.youtube.com/playlist?list=");

        try {
            const playlistPromise = searchPlaylist.GetPlaylistData(params[1]);

            const playlist = await playlistPromise;

            songs = playlist.items.map(newSong => ({
                title: newSong.title,
                url: "https://www.youtube.com/watch?v=" + newSong.id,
                author: "",
                image: newSong.thumbnail.thumbnails[0].url,
            }));
        } catch (e) {
            console.log("NOT a Playlist");
        }
    } else {
        try {
            const songInfo = await ytdl.getInfo(args[1]);

            song = {
                title: songInfo.videoDetails.title,
                url: songInfo.videoDetails.video_url,
                author: songInfo.videoDetails.author.name,
                image: songInfo.videoDetails.thumbnails[0].url,
            };
        } catch (e) {
            console.log("Not URL");
        }

        if (!song) {
            const keyword = args.splice(1).join(" ");
            const opts = {
                maxResults: 4,
                key: process.env.YOUTUBE_API_KEY,
            };

            const { results } = await search(keyword, opts);

            song = {
                title: results[0].title,
                url: results[0].link,
                author: results[0].channelTitle,
                image: results[0].thumbnails.default.url,
            };
        }
    }

    if (!serverQueue) {
        const queueContruct = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: songs || [],
            volume: 5,
            playing: true,
        };

        queue.set(message.guild.id, queueContruct);

        queueContruct.songs.push(song);

        try {
            const connection = await voiceChannel.join();
            queueContruct.connection = connection;
            play(message.guild, queueContruct.songs[0]);
        } catch (err) {
            console.log(err);
            queue.delete(message.guild.id);
            return message.channel.send(err);
        }
    } else {
        serverQueue.songs.push(song);
        return message.channel.send(`**${song.title}** has been added to the queue!`);
    }
}

function skip(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send("You have to be in a voice channel to skip!");
    if (!serverQueue) return message.channel.send("There is no song that I could skip!");
    serverQueue.connection.dispatcher.end();
}

function skipTo(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send("You have to be in a voice channel to skip!");
    if (!serverQueue) return message.channel.send("There is no song that I could skip!");

    const skips = message.content.split(" ")[1];

    console.log("in skip to");

    if (isNumeric(skips)) {
        // const currentSongs = serverQueue.songs.slice(0, 10);
        serverQueue.songs.splice(0, skips);
        serverQueue.connection.dispatcher.end();
    } else {
        return message.channel.send("Wrong value!");
    }
}

function stop(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send("You have to be in a voice channel to stop the music!");
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
}

async function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const dispatcher = serverQueue.connection
        .play(ytdl(song.url))
        .on("finish", () => {
            console.log("finished");
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

    const embed = new MessageEmbed()
        .setColor("#FD1C03")
        .setTitle("Playing")
        .setURL(song.url)
        .setAuthor(song.author)
        .setDescription(`**${song.title}**`)
        .setThumbnail(song.image)
        .setTimestamp()
        .setFooter("Copyright © Nixøn 2021", process.env.image);
    // ø ©

    const { textChannel } = serverQueue;

    textChannel.messages
        .fetch({ limit: 1 })
        .then(messages => {
            let lastMessage = messages.first();

            if (!lastMessage.author.bot) playMsg = false;
        })
        .catch(console.error);

    if (!playMsg) {
        playMsg = await textChannel.send({
            embed,
        });
    } else {
        playMsg.edit({
            embed,
        });
    }
}

function shuffle(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send("You have to be in a voice channel to shuffle!");
    if (!serverQueue || serverQueue.songs.length < 2)
        return message.channel.send("There is not a queue to shuffle!");

    serverQueue.songs = shuffleFunction(serverQueue.songs);
}

function status(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send({
            embed: {
                color: 0x80ff00,
                description: "You have to be in a voice channel to stop the music!",
            },
        });

    if (!serverQueue || !serverQueue.songs)
        return message.channel.send({
            embed: { color: 0x80ff00, description: "There are no songs queued at the moment!" },
        });

    const embed = new MessageEmbed()
        .setColor("#FD1C03")
        .setTitle("Current Queue:")
        // .setDescription(`**${song.title}**`)
        // .setThumbnail(song.image)
        .setTimestamp()
        .setFooter("Copyright © Nixøn 2021", process.env.image);

    if (serverQueue.songs.length > 3) {
        for (let i = 0; i < 3; i++) {
            const song = serverQueue.songs[i];

            embed.addField("\u200B", song.title);
            // embed.addField(song.author, )
            // embed.addFields([
            //     { name: "\u200B", value: "\u200B" },
            //     { name: song.author, value: song.title },
            // ]);
        }
        embed.addField("\u200B", "...");
    } else {
        for (const song of serverQueue.songs) {
            embed.addField("\u200B", song.title);
        }
    }

    message.channel.send({
        embed,
    });
}

// Utilities
function isNumeric(str) {
    if (typeof str != "string") return false;
    return !isNaN(str) && !isNaN(parseFloat(str));
}

function shuffleFunction(array) {
    let currentIndex = array.length,
        randomIndex;

    // While there remain elements to shuffle...
    while (currentIndex != 0) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [ array[currentIndex], array[randomIndex] ] = [ array[randomIndex], array[currentIndex] ];
    }

    return array;
}
