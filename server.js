//
// set up
//
var express  = require('express');
var app      = express();                   // create our app w/ express
var morgan = require('morgan');             // log requests to the console (express4)
var bodyParser = require('body-parser');    // pull information from HTML POST (express4)
var argv = require('minimist')(process.argv.slice(2));

//
// valid flags:
//
// required:
// --port [port]
// --hostname [hostname]
//
// optional:
// --disablessl
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

if (!argv.disablessl) {
    // set up a route to redirect http to https
    app.get('*', function(req, res) {  
	res.redirect('https://' + req.headers['host'] + req.url)
    })
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

// Get ISO 3166-1 alpha-2 code -> country name mapping
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
// Not currently used.
app.get('/api/list_all_days', function(req, res) {
    res.json(days);
});

// Returns aggregated resolutions for all countries on a per-day basis
// in a highcharts-friendly timeseries format for the UI's chart.
// Country is optional: if missing, will aggregate across all countries of origin
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
	    if (domain === "all") {
		// Aggregate across all domains
		for (var domain_i in data) {
		    series = chart_for_domain_helper(timestamp, domain_i, country, data, series);
		}
	    } else {
		// Single domain
		series = chart_for_domain_helper(timestamp, domain, country, data, series);
	    }
	}
    }
    // Construct series return array
    for (var country in series) {
	ret.push({
	    type: 'area',
	    name: files["country_code_map.json"][country.toLowerCase()],
	    data: series[country]
	});
    }
    res.json(ret);
});

// Helper function for chart_for_domain endpoint
function chart_for_domain_helper(timestamp, domain, country, data, series) {
    if (domain in data) {
	var domain_data = data[domain];
	if (country) {
	    // Perform for single country
	    if (country in domain_data) {
		var origin_data = domain_data[country];
		series = resolved_country_sum_helper(origin_data, timestamp, series);
	    }
	} else {
	    // Perform for all countries
	    for (var origin_country in domain_data) {
		var origin_data = domain_data[origin_country];
		series = resolved_country_sum_helper(origin_data, timestamp, series);
	    }
	}
    }
    return series;
}

// Helper for chart_for_domain_helper
function resolved_country_sum_helper(origin_data, timestamp, series) {
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
    return series;
}

// Fetch aggregate data for the total # of resolutions per-country (shown in tooltips)
app.get('/api/total_resolution_stats/:date', function(req, res) {
    var filename = "cntry-cntry.json";
    var date = req.params.date;
    var ret = {};
    if (date in files && filename in files[date]) {
	var data = files[date][filename];
	// Aggregate across all domains
	for (var domain_i in data) {
	    var domain_data = data[domain_i];
	    var max_res = -1;  // Maximum resolutions (use to find primary resolution for domain)
	    var max_res_country = '';
	    var domain_res = {};
	    // Perform for all countries of origin
	    for (var origin_country in domain_data) {
		var origin_data = domain_data[origin_country];
		for (var resolved_country in origin_data) {
		    if (resolved_country !== "undefined") {
			domain_res[resolved_country] = 1;
			var res_val = origin_data[resolved_country];
			if (res_val > max_res) {
			    max_res = res_val;
			    max_res_country = resolved_country;
			}
		    }
		}
	    }
	    // Iterate over aggregated per-domain resolution & add to total
	    for (var country in domain_res) {
		if (!ret[country]) {
		    ret[country] = { primary_resolutions: 0, total_resolutions: 0 };
		}
		ret[country].total_resolutions += 1;
	    }
	    if (max_res_country !== '') {
		ret[max_res_country].primary_resolutions += 1;
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
    var filename = "cntry-cntry.json";
    if (date in files && filename in files[date]) {
	var data = files[date][filename];
	if (domain === 'all') {
	    var ret = {};
	    // aggregating all domains
	    for (var domain_i in data) {
		var domain_data = data[domain_i];
		for (var from_country in domain_data) {
		    if (!(from_country in ret)) {
			ret[from_country] = {};
		    }
		    var from_country_data = domain_data[from_country];
		    for (var to_country in from_country_data) {
			if (!(to_country in ret[from_country])) {
			    ret[from_country][to_country] = 0.0;
			}
			ret[from_country][to_country] += from_country_data[to_country];
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

// Get all similarly responding domains according to cluster.json
// This data is currently shown on the UI below the charts
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
// listen (start app with node server.js)
//
app.listen(argv.port, argv.hostname);
console.log("Server listening on " + argv.hostname + ":" + argv.port );
