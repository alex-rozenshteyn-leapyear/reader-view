/* globals Readability, config */
'use strict';

{
  if (Readability.prototype._getReadTime === undefined) {
    Readability.prototype._getReadTime = function(textContent) {
      const lang = document.documentElement.lang || 'en';
      const readingSpeed = this._getReadingSpeedForLanguage(lang);
      const charactersPerMinuteLow = readingSpeed.cpm - readingSpeed.variance;
      const charactersPerMinuteHigh = readingSpeed.cpm + readingSpeed.variance;
      const length = textContent.length;
      return {
        readingTimeMinsSlow: Math.ceil(length / charactersPerMinuteLow),
        readingTimeMinsFast: Math.ceil(length / charactersPerMinuteHigh)
      };
    };
    Readability.prototype._getReadingSpeedForLanguage = function(lang) {
      const readingSpeed = new Map([
        ['en', {cpm: 987, variance: 118}],
        ['ar', {cpm: 612, variance: 88}],
        ['de', {cpm: 920, variance: 86}],
        ['es', {cpm: 1025, variance: 127}],
        ['fi', {cpm: 1078, variance: 121}],
        ['fr', {cpm: 998, variance: 126}],
        ['he', {cpm: 833, variance: 130}],
        ['it', {cpm: 950, variance: 140}],
        ['jw', {cpm: 357, variance: 56}],
        ['nl', {cpm: 978, variance: 143}],
        ['pl', {cpm: 916, variance: 126}],
        ['pt', {cpm: 913, variance: 145}],
        ['ru', {cpm: 986, variance: 175}],
        ['sk', {cpm: 885, variance: 145}],
        ['sv', {cpm: 917, variance: 156}],
        ['tr', {cpm: 1054, variance: 156}],
        ['zh', {cpm: 255, variance: 29}]
      ]);
      return readingSpeed.get(lang) || readingSpeed.get('en');
    };
    const pars = Readability.prototype.parse;
    Readability.prototype.parse = function(...args) {
      const rtn = pars.apply(this, args);
      return Object.assign(
        rtn,
        this._getReadTime(rtn.textContent)
      );
    };
  }
}

// The implementation is from https://stackoverflow.com/a/5084441/260793
function getSelectionHTML() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount && selection.toString().length > 100) {
    let range;
    if (selection.getRangeAt) {
      range = selection.getRangeAt(0);
    }
    else {
      range = document.createRange();
      range.setStart(selection.anchorNode, selection.anchorOffset);
      range.setEnd(selection.focusNode, selection.focusOffset);
    }
    const doc = document.implementation.createHTMLDocument(document.title);

    const article = doc.body.appendChild(doc.createElement('article'));
    article.appendChild(range.extractContents());
    return doc;
  }
  else {
    return;
  }
}

{
  const article = new Readability(
    getSelectionHTML() || document.cloneNode(true)
  ).parse();
  article.url = article.url || location.href;

  // https://get.foundation/sites/docs/rtl.html
  if (article.dir === null) {
    const lang = document.documentElement.lang;
    if (lang && ['ar', 'zh', 'fa', 'he', 'iw', 'ur', 'yi', 'ji'].some(a => lang.indexOf(a) !== -1)) {
      article.dir = 'rtl';
    }
  }

  // if a website has an automatic redirect use this method to wait for a new page load
  if (location.href.indexOf('://news.google.') !== -1 &&
      location.href.indexOf('/articles/') !== -1) {
    window.addEventListener('unload', () => chrome.runtime.sendMessage({
      cmd: 'reader-on-reload'
    }));
  }
  else {
    const convert = () => config.load(async () => {
      const prefs = config.prefs;
      if (prefs.embedded || window.embedded === true) {
        const {pathname, hostname} = (new URL(article.url));
        const title = document.title;
        const getFont = font => {
          switch (font) {
          case 'serif':
            return 'Georgia, "Times New Roman", serif';
          case 'sans-serif':
          default:
            return 'Helvetica, Arial, sans-serif';
          }
        };
        document.head.outerHTML = (await (await fetch(chrome.runtime.getURL('/data/reader/head.html'))).text())
          .replace('/*user-css*/', `
            body {
              font-size:  ${prefs['font-size']}px;
              font-family: ${getFont(prefs.font)} !important;
              width: ${prefs.width ? prefs.width + 'px' : 'calc(100vw - 50px)'};
            }
          ` + prefs['user-css'])
          .replace('%light-color%', '#222')
          .replace('%light-bg%', 'whitesmoke')
          .replace('%dark-color%', '#eee')
          .replace('%dark-bg%', '#333')
          .replace('%sepia-color%', '#5b4636')
          .replace('%sepia-bg%', '#f4ecd8')
          .replace('%solarized-light-color%', '#586e75')
          .replace('%solarized-light-bg%', '#fdf6e3')
          .replace('%groove-dark-color%', '#cec4ac')
          .replace('%groove-dark-bg%', '#282828')
          .replace('%solarized-dark-color%', '#93a1a1')
          .replace('%solarized-dark-bg%', '#002b36');
        document.body.outerHTML = (await (await fetch(chrome.runtime.getURL('/data/reader/body.html'))).text())
          .replace('%content%', article.content)
          .replace('%title%', article.title || 'Unknown Title')
          .replace('%byline%', article.byline || '')
          .replace('%reading-time-fast%', article.readingTimeMinsFast)
          .replace('%reading-time-slow%', article.readingTimeMinsSlow)
          .replace('%href%', article.url)
          .replace('%hostname%', hostname)
          .replace('%pathname%', pathname)
          .replace('%data-images%', prefs['show-images'])
          .replace('%data-mode%', prefs.mode)
          .replace('%data-font%', prefs.font)
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        document.title = title;
        document.dir = article.dir ? article.dir : '';
      }
      else {
        chrome.runtime.sendMessage({
          cmd: 'open-reader',
          article
        });
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', convert);
    }
    else {
      convert();
    }
  }
}
