//
// set up
//
var express  = require('express');
var app      = express();                   // create our app w/ express
var logger = require('morgan');             // log requests to the console (express4)
var rotator = require('file-stream-rotator');
var bodyParser = require('body-parser');    // pull information from HTML POST (express4)
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');

//
// valid flags:
//
// required:
// --port [port]
// --hostname [hostname]
//
//
var intRegex = /^\d+$/;
if (!argv.port && !argv.hostname) {
    console.error("ERROR: Missing required parameters --port and --hostname");
    process.exit(1);
} else if (!argv.port && !argv.hostname) {
    console.error("ERROR: Missing required parameter --port");
    process.exit(1);
} else if (!argv.hostname) {
    console.error("ERROR: Missing required parameter --hostname");
    process.exit(1);
} else if (!intRegex.test(argv.port) || parseInt(argv.port) <= 0 || parseInt(argv.port) >= 65535) {
    console.error("ERROR: Invalid value for --port");
    process.exit(1);
}

//
// configuration
//
app.disable('x-powered-by');

app.use(express.static(__dirname + '/public'));                 // set the static files location /public/img will be /img for users

var logdir = __dirname + '/access.log';
fs.existsSync(logdir) || fs.mkdirSync(logdir);

var accessLog = rotator.getStream({
  filename: logdir + '/access-%DATE%.log',
  frequency: 'daily',
  verbose: false
});

app.use(logger(':req[X-Real-IP] :req[X-Forwarded-For] :req[CF-IPCountry] - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"', {stream: accessLog}));

app.use(bodyParser.urlencoded({'extended':'true'}));            // parse application/x-www-form-urlencoded
app.use(bodyParser.json());                                     // parse application/json
app.use(bodyParser.json({ type: 'application/vnd.api+json' })); // parse application/vnd.api+json as json

//
// load data from files into memory structure (indexed by filename)
//
var fs = require('fs');
var path = require('path');

var FILES = {};
var DAYS = [];  // Sorted list of days for which we have satellite data
var dataDir = "./data";

console.log("Loading data files from " + dataDir);

var dataFiles = fs.readdirSync(dataDir);
dataFiles.forEach(function(file) {
    abs_file = path.resolve(dataDir, file);
    var stat = fs.statSync(abs_file);
    if (stat.isDirectory()) {
        DAYS.push(file);
        FILES[file] = {};
        // Recurse into each satellite run directory
        var dailyPath = dataDir + '/' + file;
        var dailyFiles = fs.readdirSync(dailyPath);
        dailyFiles.forEach(function(dailyFile) {
            // Load run files into map, emulating directory structure
            abs_file = path.resolve(dailyPath, dailyFile);
            var data = fs.readFileSync(abs_file);
            FILES[file][dailyFile] = JSON.parse(data.toString());
            console.log("Loaded data file: " + file + '/' + dailyFile);
        });
    } else {
        // This is a non-satellite data file (top-level)
        var data = fs.readFileSync(abs_file);
        FILES[file] = JSON.parse(data.toString());
        console.log("Loaded data file: " + file);
    }
});
           
//
// routes
//

// Get ISO 3166-1 alpha-2 code -> country name mapping
app.get('/api/country_code_map', function(req, res) {
    var filename = "country_code_map.json";
    if (filename in FILES) {
        var data = FILES[filename];
        res.json(data);
    } else {
        res.json({});
    }
});

// List all days for which we have data
// Not currently used.
app.get('/api/list_all_days', function(req, res) {
    res.json(DAYS);
});

// Returns aggregated resolutions for all countries on a per-day basis
// in a highcharts-friendly timeseries format for the UI's chart.
// Country is optional: if missing, will aggregate across all countries of origin
app.get('/api/chart_for_domain/:domain', function(req, res) {
    var domain = req.params.domain;
    var country = req.query.country;
    var filename = "country-country.json";
    var ret = [];
    var series = {};
    for (var i in DAYS) {
        var date = DAYS[i];
        var timestamp = Math.floor(new Date(date));
        if (date in FILES && filename in FILES[date]) {
            var data = FILES[date][filename];
            if (domain === "all") {
                // Aggregate across all domains
                for (var domain_i in data) {
                    series = chartForDomainHelper(timestamp, domain_i, country, data, series);
                }
            } else {
                // Single domain
                series = chartForDomainHelper(timestamp, domain, country, data, series);
            }
        }
    }
    // Construct series return array
    for (var country in series) {
        ret.push({
            type: 'area',
            name: FILES["country_code_map.json"][country.toLowerCase()],
            data: series[country]
        });
    }
    res.json(ret);
});

// Helper function for chart_for_domain endpoint
function chartForDomainHelper(timestamp, domain, country, data, series) {
    if (domain in data) {
        var domainData = data[domain];
        if (country) {
            // Perform for single country
            if (country in domainData) {
                var originData = domainData[country];
                series = resolvedCountrySumHelper(originData, timestamp, series);
            }
        } else {
            // Perform for all countries
            for (var originCountry in domainData) {
                var originData = domainData[originCountry];
                series = resolvedCountrySumHelper(originData, timestamp, series);
            }
        }
    }
    return series;
}

// Helper for chart_for_domain_helper
function resolvedCountrySumHelper(originData, timestamp, series) {
    for (var resolvedCountry in originData) {
        if (resolvedCountry !== "undefined") {
            if (!series[resolvedCountry]) {
                series[resolvedCountry] = [];
            }
            // See if we've already have an entry for today (if so, sum to that)
            var len = series[resolvedCountry].length;
            var lastEntry = series[resolvedCountry][len - 1];
            if (lastEntry && lastEntry[0] === timestamp) {
                series[resolvedCountry][len - 1][1] += originData[resolvedCountry];
            } else {
                series[resolvedCountry].push([timestamp, originData[resolvedCountry]]);
            }
        }
    }
    return series;
}

// Fetch aggregate data for the total # of resolutions per-country (shown in tooltips)
app.get('/api/total_resolution_stats/:date', function(req, res) {
    var filename = "country-country.json";
    var date = req.params.date;
    var ret = {};
    if (date in FILES && filename in FILES[date]) {
        var data = FILES[date][filename];
        // Aggregate across all domains
        for (var domain_i in data) {
            var domainData = data[domain_i];
            var maxRes = -1;  // Maximum resolutions (use to find primary resolution for domain)
            var maxResCountry = '';
            var domainRes = {};
            // Perform for all countries of origin
            for (var originCountry in domainData) {
                var originData = domainData[originCountry];
                for (var resolvedCountry in originData) {
                    if (resolvedCountry !== "undefined") {
                        domainRes[resolvedCountry] = 1;
                        var resVal = originData[resolvedCountry];
                        if (resVal > maxRes) {
                            maxRes = resVal;
                            maxResCountry = resolvedCountry;
                        }
                    }
                }
            }
            // Iterate over aggregated per-domain resolution & add to total
            for (var country in domainRes) {
                if (!ret[country]) {
                    ret[country] = { primary_resolutions: 0, total_resolutions: 0 };
                }
                ret[country].total_resolutions += 1;
            }
            if (maxResCountry !== '') {
                ret[maxResCountry].primary_resolutions += 1;
            }
        }
    }
    res.json(ret);
});

// Get country->country data (from cntry-cntry.json) for domain for date
// 'all' domain will be interpreted as aggregating across all domains
app.get('/api/countries_by_domain/:domain/:date', function(req, res) {
    var domain = req.params.domain;
    var date = req.params.date;
    var filename = "country-country.json";
    if (date in FILES && filename in FILES[date]) {
        var data = FILES[date][filename];
        if (domain === 'all') {
            var ret = {};
            // aggregating all domains
            for (var domain_i in data) {
                var domainData = data[domain_i];
                for (var fromCountry in domainData) {
                    if (!(fromCountry in ret)) {
                        ret[fromCountry] = {};
                    }
                    var fromCountryData = domainData[fromCountry];
                    for (var toCountry in fromCountryData) {
                        if (!(toCountry in ret[fromCountry])) {
                            ret[fromCountry][toCountry] = 0.0;
                        }
                        ret[fromCountry][toCountry] += fromCountryData[toCountry];
                    }
                }
            }
            res.json(ret);
        } else {
            if (domain in data) {
                res.json(data[domain]);
            } else {
                res.json({});
            }
        }
    } else {
        res.json({});
    }
});

// List all domains that we have data for on the given date
// This is used to populate the search autocomplete on the UI
app.get('/api/list_all_domains/countries_by_domain/:date', function(req, res) {
    var domain = req.params.domain;
    var date = req.params.date;
    var filename = "country-country.json";
    if (date in FILES && filename in FILES[date]) {
        var data = FILES[date][filename];
        var domainList = [];
        for(var domain in data) {
            domainList.push(domain);
        }
        res.json(domainList);
    } else {
        res.json([]);
    }
});

// Get all similarly responding domains according to cluster.json
// This data is currently shown on the UI below the charts
app.get('/api/similar_domains/:domain/:date', function(req, res) {
    var domain = req.params.domain;
    var date = req.params.date;
    var filename = "clusters.json";
    if (date in FILES && filename in FILES[date]) {
        var data = FILES[date][filename];
        var found = false;
        for (var i = 0; i < data.length; i++) {
            var cluster = data[i];
            if (cluster != null) {
                for (var j = 0; j < cluster.length; j++) {
                    if (cluster[j] === domain) {
                        found = true;
                        res.json(cluster);
                    }
                }
            }
        }
        if (!found) {
            res.json([]);
        }
    } else {
        res.json([]);
    }
});

//
// listen (start app with node server.js)
//
app.listen(argv.port, argv.hostname);
console.log("Server listening on " + argv.hostname + ":" + argv.port );

//
// error handling
//
process.on('uncaughtException', function(err) {
    console.log(err);
    process.exit(1);
});
