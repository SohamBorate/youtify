const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const commander = yargs(hideBin(process.argv));

commander.command("download", "download with spotify url, by searching song, put query between quotes (\")");
commander.command("set [credentials]", "set spotify app credentials");
commander.option("clientId", {
    type: "string",
    description: "spotify app client id"
});
commander.option("clientSecret", {
    type: "string",
    description: "spotify app client secret"
});
commander.usage("$0 <command>");
commander.parse();

var parseCommand = () => {
    return new Promise((resolve) => {
        let argv = commander.argv;
        if (argv._.includes("download")) {
            // retrieveToken();
            resolve({cmd: "download", argv: argv});
        }
        if (argv._.includes("set")) {
            // set();
            resolve({cmd: "set", argv: argv});
        }
    });
}

module.exports = parseCommand;