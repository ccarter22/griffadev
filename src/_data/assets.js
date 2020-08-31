module.exports = {
    getPath: (assetName) => {
        if (process.env.NODE_ENV === "production") {
            const assets = require("../_includes/manifest.json");
            const modulePath = assets[assetName];
            if(!modulePath) {
              throw new Error(`error with getAsset, ${assetName} does not exist in manifest.json`);
            }
            return modulePath;
        } else {
            return `src/assets/${assetName}`;
        }
    },
    getHero: (post, hero) => {
        if(!hero || !hero.image) {
            return `images/logo.svg`;
        }
        const dir = post.template.fileSlug.dirs.join("/");
        return `${dir}/${hero.image}`;
    }
}