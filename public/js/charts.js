// Parse GET parameters
function parseParam(val) {
    var result = null,
        tmp = [];
    var items = location.search.substr(1).split("&");
    for (var index = 0; index < items.length; index++) {
        tmp = items[index].split("=");
        if (tmp[0] === val) result = decodeURIComponent(tmp[1]);
    }
    return result;
}

var countryParam = parseParam('c'),
    domainParam = parseParam('url'),
    dateParam = parseParam('date');

var DEFAULT_DOMAIN = (domainParam !== null && domainParam !== 'all') ? domainParam : 'www.dhl.com'; // Default fallback domain

// Mutable global state variable
var CURR_COUNTRY = (countryParam !== null) ? countryParam : '',
    CURR_DOMAIN = (domainParam !== null) ? domainParam : DEFAULT_DOMAIN,
    DATE = (dateParam !== null) ? dateParam : '06-29-2015',
    COUNTRY_CODE_MAP = {},
    RESOLUTION_STATS = {}, // Mapping of country->resolution stats
    COUNTRY_TO_COUNTRY, // Currently loaded country->country clustering data
    DAILY_RESOLUTIONS = {}, // Resolutions for the current country/day/domain
    TOTAL_RESOLUTIONS = -1; // Total resolutions in all countries for the current country/day/domain

// Immutable variables
var baseMapPath = "https://code.highcharts.com/mapdata/",
    showDataLabels = false, // Switch for data labels enabled/disabled
    map = "custom/world.js",
    mapDesc = "World",
    mapKey = map.slice(0, -3),
    svgPath = baseMapPath + mapKey + '.svg',
    geojsonPath = baseMapPath + mapKey + '.geo.json',
    javascriptPath = baseMapPath + map;

$(function () {
    // Fetch map of country code -> friendly country names
    $.get( "/api/COUNTRY_CODE_MAP", function( data ) {
	COUNTRY_CODE_MAP = data;

	// Add "All Countries" table entry
	var allCountriesString = "<tr class='info'><td></td><td class='country-label' data-country=''>All Countries</td></tr>";
	$("#country-table-body").append(allCountriesString);
	
	// Update country selection sidebar
	$.each(data, function (countryCode) {
	    var friendlyCountryName = COUNTRY_CODE_MAP[countryCode];
	    var classString = "";
	    // Add f32 flag icon to row
	    var flagString = '<td><span class="f32"><span class="flag ' + countryCode + '" id="flag"></span></span></td>';
	    var elementString = "<tr class='" + classString + "'>" + flagString + "<td class='country-label' data-country='" + countryCode + "'>" + friendlyCountryName + "</td></tr>";
	    $("#country-table-body").append(elementString);
	});

	// Add click handler for countries table
	$(".country-label").click(function() {
	    CURR_COUNTRY = $(this).attr("data-country");
	    $("#country-table-body tr.info").each(function () {
		$(this).removeClass("info");
	    });
	    $(this).parent().addClass("info");
	    mapReady(true);
	});
	
	countryCodeMapLoaded();
    });
});

function countryCodeMapLoaded() {
    var domainCount = 0,
        searchText,
        mapOptions = '';

    // Load list of available domains for the date
    $.get( "/api/list_all_domains/countries_by_domain/" + DATE, function( data ) {
	// Populate dropdown menus and turn into jQuery UI widgets
	$.each(data, function (index, domain) {
	    mapOptions += '<option value="' + domain + '">' + domain + '</option>';
	    domainCount += 1;
        });
	searchText = 'Search ' + domainCount + ' domains';
	$("#mapDropdown").append(mapOptions).combobox();
	
	// Change map when item selected in dropdown
	$('#mapDropdown').change(function() {
	    var domain = $("option:selected", this).text();
	    CURR_DOMAIN = domain;
	    mapChange(true);
	});

	// Trigger change event to load domain
	if (CURR_DOMAIN === 'all') {
	    allDomainsClick();
	} else {
	    $('#mapDropdown').val(CURR_DOMAIN);
	    $('#mapDropdown').change();
	}
    });
}

// When map to load has changed
// reload_chart = true if loading a different domain/country
// reload_chart = false if loading a different day (i.e. from chart)
function mapChange(reloadChart) {
    // Show loading spinner for map
    if ($("#map-container").highcharts()) {
        $("#map-container").highcharts().showLoading('<i class="fa fa-spinner fa-spin fa-2x"></i>');
    }
    
    if (reloadChart) {
	// Show loading spinner for chart
	if ($("#chart-container").highcharts()) {
            $("#chart-container").highcharts().showLoading('<i class="fa fa-spinner fa-spin fa-2x"></i>');
	}
    }

    // Fetch resolution stats for date
    $.get( "/api/total_RESOLUTION_STATS/" + DATE, function( data ) {
	RESOLUTION_STATS = data;
    });

    // Fetch data for the current domain on the current date
    $.get( "/api/countries_by_domain/" + CURR_DOMAIN + "/" + DATE, function( data ) {
	COUNTRY_TO_COUNTRY = data;
	
        // Check whether the map is already loaded, else load it and
        // then show it async
        if (Highcharts.maps[mapKey]) {
	    mapReady(reloadChart);
        } else {
	    $.getScript(javascriptPath, function() { mapReady(reloadChart) });
        }
    });

    // Populate similar domains tables below chart
    $.get( "/api/similar_domains/" + CURR_DOMAIN + "/" + DATE, function( data ) {
	$("#domain-table-body-0").empty();
	$("#domain-table-body-1").empty();
	$("#domain-table-body-2").empty();
	$("#domain-table-body-3").empty();

	$.each(data, function (i) {
	    var domain = data[i];
	    var classString = "";
	    if (domain == CURR_DOMAIN) {
		classString = "info";
	    }
	    var elementString = "<tr class='" + classString + "'><td class='domain-label' data-domain='" + domain + "'>" + domain + "</td></tr>";

	    // Distribute the domains across the 4 tables
	    if (0 <= i && i < data.length / 4) {
		$("#domain-table-body-0").append(elementString);
	    } else if (data.length / 4 <= i && i < data.length / 2) {
		$("#domain-table-body-1").append(elementString);
	    } else if (data.length / 2 <= i && i < 3 * data.length / 4) {
		$("#domain-table-body-2").append(elementString);
	    } else {
		$("#domain-table-body-3").append(elementString);
	    }
	});

	// Add click handler for countries table
	$(".domain-label").click(function() {
	    // Visually clear selections from all 4 tables & set our selection
	    $("#domain-table-body-0 tr.info").each(function () {
		$(this).removeClass("info");
	    });
	    $("#domain-table-body-1 tr.info").each(function () {
		$(this).removeClass("info");
	    });
	    $("#domain-table-body-2 tr.info").each(function () {
		$(this).removeClass("info");
	    });
	    $("#domain-table-body-3 tr.info").each(function () {
		$(this).removeClass("info");
	    });
	    $(this).parent().addClass("info");

	    var value = $(this).attr("data-domain");
	    CURR_DOMAIN = value;
	    $('#mapDropdown').val(value);
	    $('#mapDropdown').change();
	});
    });
}

// When the map is loaded or ready from cache...
// reload_chart = true if loading a different domain/country
// reload_chart = false if loading a different day (i.e. from chart)
function mapReady(reload_chart) {
    var mapGeoJSON = Highcharts.maps[mapKey],
	data = [],
	parent,
	match;

    if (reload_chart) {
	// Fetch data for the current domain & country for the timeseries chart
	$.get( "/api/chart_for_domain/" + CURR_DOMAIN + "?country=" + CURR_COUNTRY.toUpperCase(), function (data) {
	    chartChange(data);
	});
    }

    // Load data for the currently selected country
    var aggregated_data = {};
    if (CURR_COUNTRY == '') {
	// Sum the data for all countries
	$.each(COUNTRY_TO_COUNTRY, function(fromCountry, currCountryData) {
	    $.each(currCountryData, function (toCountry, value) {
		if (toCountry !== "undefined") {
		    if (aggregated_data[toCountry]) {
			aggregated_data[toCountry] += value;
		    } else {
			aggregated_data[toCountry] = value;
		    }
		}
	    });
	});
    } else {
	// Data for a single country
	var currCountryData = COUNTRY_TO_COUNTRY[CURR_COUNTRY.toUpperCase()];
	if (currCountryData) {
	    $.each(currCountryData, function (toCountry, value) {
		if (toCountry !== "undefined") {
		    aggregated_data[toCountry] = value;
		}
	    });
	}
    }

    // Put formatted data into map series array
    var currCountryVal = 0;
    var sum = 0;
    $.each(COUNTRY_CODE_MAP, function(country, countryName) {
	var value = 0;
	var countryUpper = country.toUpperCase();
	if (countryUpper in aggregated_data) {
	    value = aggregated_data[countryUpper];
	}
	if (country === CURR_COUNTRY) {
	    CURR_COUNTRYVal = value;
	} else {
	    data.push({
		key: country,
		value: value
	    });
	}
	sum += value;
    });

    DAILY_RESOLUTIONS = aggregated_data; // set map of country->resolutions
    TOTAL_RESOLUTIONS = sum; // set total resolutions sum
    
    // Always put the current country on the end
    // (otherwise I think it screws with the red outline)
    data.push({
	key: CURR_COUNTRY,
	value: currCountryVal,
	borderColor: '#ED1C24'
    });

    var seriesName = (CURR_COUNTRY === '') ? 'All Countries' : COUNTRY_CODE_MAP[CURR_COUNTRY];
    var domainName = (CURR_DOMAIN === 'all') ? 'All Domains' : CURR_DOMAIN;
    
    // Instantiate chart
    $('#map-container').highcharts('Map', {
        title: {
            text: 'Resolutions for ' + domainName + ' in ' + seriesName + ' on ' + DATE
        },
        mapNavigation: {
            enabled: true
        },
        colorAxis: {
            min: 0,
	    labels: {
		formatter: function() {
		    if (this.value === this.axis.min) {
			return 'Fewest';
		    } else if (this.value === this.axis.max) {
			return 'Most';
		    }
		}
	    },
            stops: [
                [0, '#EFEFFF'],
                [0.5, Highcharts.getOptions().colors[0]],
                [1, Highcharts.Color(Highcharts.getOptions().colors[0]).brighten(-0.5).get()]
            ]
        },
        legend: {
            layout: 'vertical',
            align: 'left',
            verticalAlign: 'bottom'
        },
	tooltip: {
            formatter: function() {
		// Display the aggregate domain resolution statistics in the map tooltips
		var series = this.series;
		var point = this.point;
		var countryCodeCaps = point.key.toUpperCase();
		var color = Highcharts.Color(Highcharts.getOptions().colors[0]).brighten(-0.5).get();
		var str = '<span style="color:' + color + '">' + point.name + '</span><br/>';
		
		// Populate tooltip for current domain
		var res = 0;
		if (countryCodeCaps in DAILY_RESOLUTIONS) {
		    res = DAILY_RESOLUTIONS[countryCodeCaps];
		}
		var domain_percent = Highcharts.numberFormat(res * 100 / TOTAL_RESOLUTIONS, 2);
		var CURR_COUNTRYStr = (CURR_COUNTRY === '') ? 'All Countries' : COUNTRY_CODE_MAP[CURR_COUNTRY];
		str += '<b>' + domain_percent + '%</b><br/>';
		
		// Populate tooltip for all domains
		var primary = 0;
		var total = 0;
		if (countryCodeCaps in RESOLUTION_STATS) {
		    var stats = RESOLUTION_STATS[countryCodeCaps];
		    var primary = stats.primary_resolutions;
		    var total = stats.total_resolutions;
		}
		var total_domains = 10000;  // assuming alexa top 10000
		var primary_percent = Highcharts.numberFormat(primary * 100 / total_domains, 2);
		var total_percent = Highcharts.numberFormat(total * 100 / total_domains, 2);
		str += '—<br/>' +
		    'Resolutions across all domains for the day<br/>' + 
		    '<b>Primary resolution:</b> ' + primary + ' (' + primary_percent + '% of all domains)<br/>' +
		    '<b>Any resolution:</b> ' + total + ' (' + total_percent + '% of all domains)<br/>';
		return str;
	    }
        },
        series: [{
            data: data,
            mapData: mapGeoJSON,
            joinBy: ['hc-key', 'key'],
            name: 'Resolutions for ' + seriesName,
            states: {
                hover: {
                    color: Highcharts.getOptions().colors[2]
                }
            },
            dataLabels: {
                enabled: showDataLabels,
                formatter: function () {
                    return mapKey === 'custom/world' || mapKey === 'countries/us/us-all' ?
                        (this.point.properties && this.point.properties['hc-a2']) :
                        this.point.name;
                }
            },
            point: {
                events: {
		    click: function () {
			// Automatically change country selection in sidebar when we click on map
			$(".country-label[data-country='" + CURR_COUNTRY + "']").parent().removeClass("info");
			CURR_COUNTRY = this.key;
			$(".country-label[data-country='" + CURR_COUNTRY + "']").parent().addClass("info");
			mapChange(true);
		    }
                }
            }
        }, {
            type: 'mapline',
            name: "Separators",
            data: Highcharts.geojson(mapGeoJSON, 'mapline'),
            nullColor: 'gray',
            showInLegend: false,
            enableMouseTracking: false
        }]
    });

    showDataLabels = $("#chkDataLabels").attr('checked');
}

// When a new time series chart is ready to load
function chartChange(data) {
    var country = (CURR_COUNTRY === '') ? 'All Countries' : COUNTRY_CODE_MAP[CURR_COUNTRY];
    var height = (CURR_DOMAIN === 'all') ? 600 : 400; // Extra height for all domains view
    $('#chart-container').height(height); // Ensure footer is positioned correctly w.r.t. container
    
    var labels = [];
    if (jQuery.isEmptyObject(data)) {
	labels.push({
	    html: "No Data Available",
	    style: {
		left: '480%',
		top: '140%',
		fontSize : '18px'
	    }
	});
    }

    // Put flag series on top of chart to make day selection easier
    if (data.length > 0) {
	data[0].id = "top";
	var days = data[0].data;
	var flagsData = [];
	for (var i = 0; i < days.length; i++) {
	    var timestamp = days[i][0];
	    flagsData.push({
		x: timestamp,
		title: '▼'
	    });
	}
	data.push({
	    type: 'flags',
	    data: flagsData,
	    shape: 'squarepin',
	    onSeries: 'top',
	    showInLegend: false,
	    tooltip: {
		pointFormat: ''
	    },
	    width: 16
	});
    }
    
    $('#chart-container').highcharts({
	chart: {
	    height: height
	},
        title: {
            text: "Click a day below to view on the map",
	    margin: 30
        },
	labels: {
	    items: labels
	},
        xAxis: {
            type: 'datetime'
        },
        yAxis: {
            title: {
                text: '% of total resolutions'
            },
	    min: 0,
	    max: 100
        },
        tooltip: {
            pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.percentage:.1f}%</b><br/>',
            shared: true
        },
        plotOptions: {
            area: {
                stacking: 'percent',
                lineColor: '#ffffff',
                lineWidth: 1,
                marker: {
                    lineWidth: 1,
                    lineColor: '#ffffff'
                }
            },
	    series: {
		cursor: 'pointer',
		events: {
		    click: function(event) {
			var x = event.point.x;
			DATE = $.datepicker.formatDate('mm-dd-yy', new Date(x));
			mapChange(false);
		    }
		},
		trackByArea: true
	    }
        },
        series: data
    });
}

// Event triggered when selecting "single domain" option
function singleDomainClick() {
    // Switch active buttons, enable input, show other sites
    $('#all-domains').removeClass('active');
    $('#single-domain').addClass('active');
    $('.custom-combobox input').prop('disabled', false); // Enable input
    $('#other-sites-container').show(); // Show "other sites" table
    
    CURR_DOMAIN = DEFAULT_DOMAIN;
    $('#mapDropdown').val(CURR_DOMAIN);
    $('#mapDropdown').change();
}

// Event triggered when selecting "all domaisn" option
function allDomainsClick() {
    // Switch active buttons, disable input, hide other sites
    $('#single-domain').removeClass('active');
    $('#all-domains').addClass('active');
    $('.custom-combobox input').val(''); // Empty input
    $('.custom-combobox input').prop('disabled', true); // Disable input
    $('#other-sites-container').hide(); // Hide "other sites" table
    
    CURR_DOMAIN = 'all';
    mapChange(true);
}

// Add handler for generating permalink
function generateLink() {
    var link = window.location.host + "?" + "c=" + CURR_COUNTRY + "&url=" + CURR_DOMAIN + "&date=" + DATE;
    $('#modal-url').val(link);
    $("#permalink-modal").modal('show');
}
