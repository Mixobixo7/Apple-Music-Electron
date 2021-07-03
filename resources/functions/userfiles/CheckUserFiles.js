const {app, dialog} = require('electron')
const {CreateUserFiles} = require('./CreateUserFiles')
const baseConfiguration = require('../../config.json');

exports.CheckUserFiles = function () {
    let MissingKeys = []

    Object.keys(baseConfiguration.css).forEach(function (key) {
        if (!app.config.css.hasOwnProperty(key)) {
            console.log(`[MissingKey] ${key}`)
            MissingKeys.push(key.toString())
        }
    })

    Object.keys(baseConfiguration.preferences).forEach(function (key) {
        if (!app.config.preferences.hasOwnProperty(key)) {
            console.log(`[MissingKey] ${key}`)
            MissingKeys.push(key)
        }
    })

    Object.keys(baseConfiguration.advanced).forEach(function (key) {
        if (!app.config.advanced.hasOwnProperty(key)) {
            console.log(`[MissingKey] ${key}`)
            MissingKeys.push(key)
        }
    })

    if (MissingKeys.length !== 0) {
        MissingKeys = MissingKeys.toString()
        const application = app.config.application
        const user = app.config.user
        const paths = {application, user}
        console.log(paths)
        CreateUserFiles("SampleConfig", paths)
        dialog.showMessageBox(app.win, {
            message: `Your current configuration differs from the configuration the application uses. Please make a backup of your current configuration - Pressing Ok will overwrite your current configuration..`,
            title: "Missing Keys in Configuration",
            type: "warning",
            detail: `Missing Keys: \n${MissingKeys}`,
            buttons: []
        }).then(() => CreateUserFiles("Config", paths))
    }
}