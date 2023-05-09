const superagent = require('superagent')

const errorAndExit = require('./errorAndExit');

module.exports = (err) => {
    console.error(err)

    if(`${err.toString().includes(`EADDRINUSE`)}`) {
        superagent.get(`http://localhost:3000/focus`).then(() => {
            console.log(`Focused existing window, exiting...`);
            app.quit()
        })
    } else errorAndExit(`${err}\n\n${err.stack? err.stack : `(no stack)`}`)
}