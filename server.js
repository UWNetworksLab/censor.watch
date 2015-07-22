//
// set up
//
var express  = require('express');
var app      = express();                   // create our app w/ express
var morgan = require('morgan');             // log requests to the console (express4)
var bodyParser = require('body-parser');    // pull information from HTML POST (express4)
var argv = require('minimist')(process.argv.slice(2));

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
app.use(express.static(__dirname + '/public'));                 // set the static files location /public/img will be /img for users
app.use(morgan('dev'));                                         // log every request to the console
app.use(bodyParser.urlencoded({'extended':'true'}));            // parse application/x-www-form-urlencoded
app.use(bodyParser.json());                                     // parse application/json
app.use(bodyParser.json({ type: 'application/vnd.api+json' })); // parse application/vnd.api+json as json

//
// load data from files into memory structure (indexed by filename)
//
var fs = require('fs');
var path = require('path');

var files = {};
var days = [];  // Sorted list of days for which we have satellite data
var dataDir = "./data";

console.log("Loading data files from " + dataDir);

var dataFiles = fs.readdirSync(dataDir);
dataFiles.forEach(function(file) {
    abs_file = path.resolve(dataDir, file);
    var stat = fs.statSync(abs_file);
    if (stat.isDirectory()) {
	days.push(file);
	files[file] = {};
	// Recurse into each satellite run directory
	var dailyPath = dataDir + '/' + file;
	var dailyFiles = fs.readdirSync(dailyPath);
	dailyFiles.forEach(function(dailyFile) {
	    // Load run files into map, emulating directory structure
	    abs_file = path.resolve(dailyPath, dailyFile);
	    var data = fs.readFileSync(abs_file);
	    files[file][dailyFile] = JSON.parse(data.toString());
	    console.log("Loaded data file: " + file + '/' + dailyFile);
	});
    } else {
	// This is a non-satellite data file (top-level)
	var data = fs.readFileSync(abs_file);
	files[file] = JSON.parse(data.toString());
	console.log("Loaded data file: " + file);
    }
});
	   
//
// routes
//
app.get('/api/country_code_map', function(req, res) {
    var filename = "country_code_map.json";
    if (filename in files) {
	var data = files[filename];
	res.json(data);
    } else {
	res.json({});
    }
});

// List all days for which we have data
app.get('/api/list_all_days', function(req, res) {
    res.json(days);
});

// Fetch aggregate data for chart for domain for country
// Country is optional: if missing, will return for All Countries
app.get('/api/chart_for_domain/:domain', function(req, res) {
    var domain = req.params.domain;
    var country = req.query.country;
    var filename = "cntry-cntry.json";
    var ret = [];
    var series = {};
    for (var i in days) {
	var date = days[i];
	var timestamp = Math.floor(new Date(date));
	if (date in files && filename in files[date]) {
	    var data = files[date][filename];
	    if (domain in data) {
		var domain_data = data[domain];
		if (country) {
		    if (country in domain_data) {
			var origin_data = domain_data[country];
			// Perform for single country
			for (var resolved_country in origin_data) {
			    if (resolved_country !== "undefined") {
				if (!series[resolved_country]) {
				    series[resolved_country] = [];
				}
				series[resolved_country].push([timestamp, origin_data[resolved_country]]);
			    }
			}
		    }
		} else {
		    // Perform for all countries
		    for (var origin_country in domain_data) {
			var origin_data = domain_data[origin_country];
			for (var resolved_country in origin_data) {
			    if (resolved_country !== "undefined") {
				if (!series[resolved_country]) {
				    series[resolved_country] = [];
				}
				// See if we've already have an entry for today (if so, sum to that)
				var len = series[resolved_country].length;
				var last_entry = series[resolved_country][len - 1];
				if (last_entry && last_entry[0] === timestamp) {
				    series[resolved_country][len - 1][1] += origin_data[resolved_country];
				} else {
				    series[resolved_country].push([timestamp, origin_data[resolved_country]]);
				}
			    }
			}
		    }
		}
	    }
	}
    }
    // Construct series return array
    for (var country in series) {
	ret.push({
	    type: 'area',
	    name: country,
	    data: series[country]
	});
    }
    res.json(ret);
});

app.get('/api/countries_by_domain/:domain/:date', function(req, res) {
    var domain = req.params.domain;
    var date = req.params.date;
    var filename = "cntry-cntry.json";
    if (date in files && filename in files[date]) {
	var data = files[date][filename];
	if (domain in data) {
	    res.json(data[domain]);
	} else {
	    res.json({});
	}
    } else {
	res.json({});
    }
});

app.get('/api/list_all_domains/countries_by_domain/:date', function(req, res) {
    var domain = req.params.domain;
    var date = req.params.date;
    var filename = "cntry-cntry.json";
    if (date in files && filename in files[date]) {
	var data = files[date][filename];
	var domain_list = [];
	for(var domain in data) {
	    domain_list.push(domain);
	}
	res.json(domain_list);
    } else {
	res.json([]);
    }
});

app.get('/api/similar_domains/:domain/:date', function(req, res) {
    var domain = req.params.domain;
    var date = req.params.date;
    var filename = "clusters.json";
    if (date in files && filename in files[date]) {
	var data = files[date][filename];
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
// application
//
/*
app.get('*', function(req, res) {
    res.sendfile('./public/index.html'); // load the single view file (angular will handle the page changes on the front-end)
});
*/

//
// listen (start app with node server.js)
//
app.listen(argv.port, argv.hostname);
console.log("Server listening on " + argv.hostname + ":" + argv.port );
