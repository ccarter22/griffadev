const { DateTime, Duration } = require("luxon");
const fs = require("fs");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const pluginSyntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginNavigation = require("@11ty/eleventy-navigation");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const markdownitmisize = require("markdown-it-imsize");
const { minify } = require("terser");
const readingTime= require('eleventy-plugin-time-to-read');
const helpers = require("./src/_data/helpers");

const siteMeta = require("./src/_data/metadata.json");

module.exports = (eleventyConfig) => {

    /* Markdown Overrides */
    let markdownLibrary = markdownIt({
      html: true,
      breaks: true,
      linkify: true,
    }).use(markdownItAnchor, {
      permalink: true,
      permalinkClass: "direct-link",
      permalinkSymbol: "<copy-link></copy-link>"
    }).use(markdownitmisize);

    eleventyConfig.addPlugin(pluginSyntaxHighlight);

     // Remember old renderer, if overridden, or proxy to default renderer
     const defaultCodeRender = markdownLibrary.renderer.rules.fence || function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

    markdownLibrary.renderer.rules.fence = (...args) => {
      const [tokens, idx, options, env, self] = args;
      env.parsedDemoIds = env.parsedDemoIds || [];
      const parsedDemoIds = env.parsedDemoIds;
      const token = tokens[idx];

      const getDataFromInfo = (token) => {
        const info = token.info || '';
        let lang = info.substr(0,info.indexOf(' ')); 
        let id = info.substr(info.indexOf(' ')+1);
        if(!lang) {
          lang = id;
          id = '';
        }
        return {id, lang};
      }

      const wrapCode = (lang, index) => {
        const renderedCode = defaultCodeRender(tokens, index, options, env, self);
        const languageKey = lang.toLowerCase() === "javascript" ? "js" : lang.toLowerCase();
        return `<div contenteditable slot="${languageKey}" data-language="${languageKey}">${renderedCode}</div>`
      };
      let dataObj = getDataFromInfo(token);
      if (dataObj && dataObj.id) {
          if(parsedDemoIds.includes(dataObj.id)) {
            return '';
          }
          let matchingTokens = [wrapCode(dataObj.lang, idx)];
          for (let i = idx+1; i < tokens.length; i++) {
            if(tokens[i].type !== "fence") {
              continue;
            }
            const {id, lang} = getDataFromInfo(tokens[i]);
            if(id &&id === dataObj.id) {
              matchingTokens.push(wrapCode(lang, i));
            }
          }
          parsedDemoIds.push(dataObj.id);
          return `
          <live-demo id=${dataObj.id}>
          ${matchingTokens.join("")}</live-demo>`;
        // find all code with matching id
      } else {
        return defaultCodeRender(...args);
      }
    }

    markdownLibrary.renderer.rules.image = (tokens) => {
      const token = tokens[0];
      const attrs = token.attrs.reduce((attrs, [key, value])=> {
        attrs[key] = value;
        return attrs;
      }, {})
      return String.raw`<figure>
        <div class="img-wrap"><img width="${attrs.width}" height="${attrs.height || ""}" src="${attrs.src}" alt="${attrs.alt || token.content}">
        <figcaption>${attrs.alt|| attrs.title || token.content}</figcaption>
      </div>
      </figure>`
    }

    // Remember old renderer, if overridden, or proxy to default renderer
    const defaultLinkRender = markdownLibrary.renderer.rules.link_open || function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

    markdownLibrary.renderer.rules.link_open = function (tokens, idx, options, env, self) {
      // If you are sure other plugins can't add `target` - drop check below
      const link = tokens[idx];
      var aIndex = link.attrIndex('target');
      const hrefIndex = link.attrIndex('href');
      if(hrefIndex > -1) {
        const href = link.attrs[hrefIndex][1];
        const isRelativeUrl= href && (href.startsWith("/") || href.startsWith("#") || href.startsWith(siteMeta.url));
        if (isRelativeUrl) {
          return defaultLinkRender(tokens, idx, options, env, self);
        }
      }
      if (aIndex < 0) {
        link.attrPush(['target', '_blank']); // add new attribute
      } else {
        link.attrs[aIndex][1] = '_blank';    // replace value of existing attr
      }

      // pass token to default renderer.
      return defaultLinkRender(tokens, idx, options, env, self);
    };

    eleventyConfig.setLibrary("md", markdownLibrary);
  
  // Browsersync Overrides
  eleventyConfig.setBrowserSyncConfig({
    callbacks: {
      ready: function (err, browserSync) {
        const content_404 = fs.readFileSync("dist/404.html");

        browserSync.addMiddleware("*", (req, res) => {
          // Provides the 404 content without redirect.
          res.write(content_404);
          res.end();
        });
      },
    },
    ui: false,
    ghostMode: false,
    open: true,
  });
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy({"src/posts/**/images/*.*": "images"});

  eleventyConfig.setUseGitIgnore(false);

  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addPlugin(pluginNavigation);
  eleventyConfig.addPlugin(readingTime);

  eleventyConfig.setDataDeepMerge(true);

  eleventyConfig.setLiquidOptions({
    dynamicPartials: true
  });

  // https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#valid-date-string
  eleventyConfig.addFilter("htmlDateString", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy-LL-dd");
  });

  eleventyConfig.addFilter("readableDate", dateObj => {
    return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat("dd LLL yyyy");
  });

  eleventyConfig.addFilter("getMins", mins => {
    return Duration.fromISO(mins * 1000);
  });

  // Get the first `n` elements of a collection.
  eleventyConfig.addFilter("head", (array, n) => {
    if (n < 0) {
      return array.slice(n);
    }

    return array.slice(0, n);
  });

  eleventyConfig.addNunjucksAsyncFilter("jsmin", async function (
    code,
    callback
  ) {
    try {
      if(process.env.NODE_ENV === 'production') {
        const minified = await minify(code);
        callback(null, minified.code);
      } else {
        callback(null, code);
      }
    } catch (err) {
      console.error("Terser error: ", err);
      // Fail gracefully.
      callback(null, code);
    }
  });

  eleventyConfig.addCollection("tagList", function (collection) {
    let tagSet = new Set();
    collection.getAll().forEach(function (item) {
      if ("tags" in item.data) {
        const tags = item.data.tags.filter(helpers.filterCollectionTags);
        for (const tag of tags) {
          tagSet.add(tag);
        }
      }
    });

    // returning an array in addCollection works in Eleventy 0.5.3
    return [...tagSet];
  });

    // Returns a collection of blog posts in reverse date order
    eleventyConfig.addCollection("archive", (collection) => {
      return [...collection.getFilteredByGlob("./src/posts/**/*.md")].reverse();
    });

  eleventyConfig.addCollection("series", function(collection) {
    const posts = collection.getFilteredByGlob("./src/posts/**/*.md");
    const seriesCollection = {}
    posts.forEach((post) => {
      if(!post.data.series) {
        return;
      }
      const series = post.data.series;
      if(!series.title) {
        throw new Error(`series defined but no title present in item: ${post.inputPath}`);
      }
      if(!series.order) {
        throw new Error(`series defined but no order for article supplied in item: ${post.inputPath}`);
      }
      if(!seriesCollection[series.title]) {
        seriesCollection[series.title] = {posts: {}, description: ''};
      }
      seriesCollection[series.title].posts[series.order - 1] = post;
      if(!seriesCollection[series.title].description && series.description) {
        seriesCollection[series.title].description = series.description;
      }
      if(!seriesCollection[series.title].last_modified || (post.date > seriesCollection[series.title].last_modified)) {
        seriesCollection[series.title].last_modified = post.date;
      }
      if(typeof(series.showTotal) !== "undefined") {
        seriesCollection[series.title].showTotal = series.showTotal;
      }
      post.data.seriesEntries= seriesCollection[series.title];
    });
    const seriesData = Object.keys(seriesCollection).map((title) => {
      const data = seriesCollection[title];
      return {
        ...data,
        title,
        posts: Object.values(data.posts)
      }
      // note this mutates
    }).sort((a, b) => b.last_modified - a.last_modified);
    return seriesData;
  })

  eleventyConfig.addFilter("getSeriesInfo", function({series, seriesEntries}) {
    if(!series || !seriesEntries) {
      return null;
    }
    const posts = seriesEntries.posts;
    const postIndex = series.order - 1;
    const next = posts[postIndex +1]
    const prev = posts[postIndex - 1]

    return {
      order: series.order,
      showTotal: seriesEntries.showTotal,
      next,
      prev,
      hasPrev: Boolean(prev),
      hasNext: Boolean(next),
      total: Object.keys(posts).length,
      title: series.title,
      description: seriesEntries.description
    }
  })

  eleventyConfig.addFilter("debugger", (...args) => {
    //tip!
    console.log(...args)
    debugger;
  })

  return {
      templateFormats: [
        "md",
        "njk",
        "html",
        "liquid"
    ],
    dir: {
      input: "src",
      output: "dist"
    },
  };
};
