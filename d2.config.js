/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: 'app',
    name: 'htn-scheduler',
    title: 'In-Form Hypertension Visit Scheduler',
    description: 'A plugin to schedule the next hypertension visit within the Capture app.',
    version: '1.0.0',
    pluginType: 'CAPTURE',
    entryPoints: {
        app: './src/App.jsx',
        plugin: './src/Plugin.tsx',
    },

    direction: 'auto',
}

module.exports = config
