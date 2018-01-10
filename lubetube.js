/*
 *  LubeTube plugin for Movian Media Center
 *
 *  Copyright (C) 2012-2018 Henrik Andersson, lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var http = require('showtime/http');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;

RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

var BASE_URL = "http://lubetube.com"

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
function colorStr(str, color) {
    return '<font color="' + color + '"> (' + str + ')</font>';
}

function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
}

service.create(plugin.title, plugin.id + ":start", 'video', true, logo);

new page.Route(plugin.id + ":play:(.*):(.*)", function(page, url, title) {
    page.loading = true;
    var doc = http.request(unescape(url)).toString();
    page.loading = false;
    page.type = "video";
    var link = doc.match(/<a id="video-hd" href="([\S\s]*?)"/);
    if (!link) link = doc.match(/<a id="video-high" href="([\S\s]*?)"/);
    if (!link) link = doc.match(/<a id="video-standard" href="([\S\s]*?)"/);
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        canonicalUrl: plugin.id + ":play:" + url + ":" + title,
        sources: [{
            url: link[1]
        }],
        no_subtitle_scan: true
    });
});

new page.Route(plugin.id + ":category:(.*):(.*)", function(page, title, url) {
    url = unescape(url);
    setPageHeader(page, unescape(title));
    var optionsAreAdded = false, options = constructMultiopt([
        [url, 'Newest'],
        [url.replace("adddate", "rate"), 'Highest Rated'],
        [url.replace("adddate", "viewnum"),'Most Viewed']
    ], service.sortCategory);
    page.options.createMultiOpt('sort', "Sort By", options, function(v) {
        service.sortCategory = v;
        if (optionsAreAdded) {
            page.flush();
            page.redirect(plugin.id + ':category:' + title + ':' + escape(url))
        }
    });
    optionsAreAdded = true;
    index(page, service.sortCategory);
});

new page.Route(plugin.id + ":categories", function(page) {
    setPageHeader(page, plugin.title + ' - Categories');
    page.loading = true;
    var doc = http.request(BASE_URL + "/categories").toString();
    page.loading = false;
    var mp = doc.match(/<ul class="gallery">([\S\s]*?)<\/ul>/)[1];
    // 1-numofvideos, 2-link, 3-icon, 4-title
    var re = /<strong>([\S\s]*?)<\/strong>[\S\s]*?href="([\S\s]*?)"><img src="([\S\s]*?)" alt="([\S\s]*?)"/g;
    var match = re.exec(mp);
    while (match) {
        page.appendItem(plugin.id + ":category:" + escape(match[4]) + ":" + escape(match[2]), "video", {
            title: new RichText(match[4] + colorStr(match[1], orange)),
            icon: match[3]
        });
        var match = re.exec(mp);
    }
});

function scraper(page, doc) {
    // 1-link, 2-title, 3-icon, 4-length, 5-views
    var re = /<span class="videothumb"[\S\s]*?href="([\S\s]*?)" title="([\S\s]*?)"><img src="([\S\s]*?)"[\S\s]*?<span class="length">Length: ([^\<]+)<[\S\s]*?<span class="views">Views: ([^\<]+)</g;
    var match = re.exec(doc);
    while (match) {
        page.appendItem(plugin.id + ":play:" + escape(match[1]) + ":" + escape(match[2]), "video", {
            title: new RichText(match[2]),
            icon: match[3],
            description: new RichText(coloredStr('Views: ', orange) + match[5]),
            genre: 'Adult',
            duration: match[4]
        });
        page.entries++;
        match = re.exec(doc);
    }
}

function index(page, url) {
    page.entries = 0;
    var tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        var doc = http.request(url.match('http') ? url : BASE_URL + url).toString();
        page.loading = false;
        var mp = doc.match(/<h2>Most Popular Videos<\/h2>([\S\s]*?)<span class="seperator_rt">/);
        if (mp) {
            page.appendItem("", "separator", {
                title: 'Most Popular Videos'
            });
            scraper(page, mp[1]);
            page.appendItem("", "separator", {
                title: 'Videos (' + doc.match(/<span class="seperator_rt">[\S\s]*?of <strong>([\S\s]*?)<\/strong>/)[1] + ')'
            });
        }
        var blob = doc.match(/<span class="seperator_rt">([\S\s]*?)<\/html>/);
        if (!blob) return tryToSearch = false;
        scraper(page, blob[1]);
        var next = doc.match(/<a class="next" href="([\S\s]*?)">Next<\/a>/);
        if (!next) return tryToSearch = false;
        url = next[1];
        return true;
    }
    loader();
    page.paginator = loader;
}

function constructMultiopt(multiOpt, storageVariable) {
    if (!storageVariable)
        multiOpt[0][2] = true;
    else
        for (var i = 0; i < multiOpt.length; i++) {
            if (multiOpt[i][0] == storageVariable) {
                multiOpt[i][2] = true;
                break;
            }
        }
    return multiOpt;
}

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.title);

    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Search at ' + BASE_URL
    });

    page.appendItem(plugin.id + ':categories', 'directory', {
        title: 'Categories'
    });
    var optionsAreAdded = false, options = constructMultiopt([
        [BASE_URL, 'Newest'],
        [BASE_URL + '/view/toprated/', 'Highest Rated'],
        [BASE_URL + '/view/mostviewed/','Most Viewed']
    ], service.sort);
    page.options.createMultiOpt('sort', "Sort By", options, function(v) {
        service.sort = v;
        if (optionsAreAdded) {
            page.flush();
            page.redirect(plugin.id + ':start');
        }
    });
    optionsAreAdded = true;
    index(page, service.sort);
});

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    setPageHeader(page, plugin.synopsis + ' / ' + query);
    index(page, BASE_URL + "/search/videos?search_id=" + encodeURI(query));
});

page.Searcher(plugin.id, logo, function(page, query) {
    index(page, BASE_URL + "/search/videos?search_id=" + encodeURI(query));
});
