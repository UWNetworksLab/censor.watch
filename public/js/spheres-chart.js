// Mutable variables
var currCountry = '',
    currDomain = 'www.dhl.com',
    country_code_map = {},
    country_to_country,  // Currently loaded country->country clustering data
    date = "06-29-2015"; // TODO - add date picker

// Immutable variables
var baseMapPath = "http://code.highcharts.com/mapdata/",
    defaultDomain = 'www.dhl.com',  // Default domain to show on initial render
    showDataLabels = false, // Switch for data labels enabled/disabled
    map = "custom/world.js",
    mapDesc = "World",
    mapKey = map.slice(0, -3),
    svgPath = baseMapPath + mapKey + '.svg',
    geojsonPath = baseMapPath + mapKey + '.geo.json',
    javascriptPath = baseMapPath + map;

$(function () {
    // Fetch map of country code -> friendly country names
    $.get( "/api/country_code_map", function( data ) {
	country_code_map = data;

	// Add "All Countries" table entry
	var element_string = "<tr class='info'><td></td><td class='country-label' data-country=''>All Countries</td></tr>";
	$("#country-table-body").append(element_string);
	
	// Update country selection sidebar
	$.each(data, function (country_code) {
	    var friendly_country_name = country_code_map[country_code];
	    var class_string = "";
	    // Add f32 flag icon to row
	    var flag_string = '<td><span class="f32"><span class="flag ' + country_code.toLowerCase() + '" id="flag"></span></span></td>';
	    var element_string = "<tr class='" + class_string + "'>" + flag_string + "<td class='country-label' data-country='" + country_code + "'>" + friendly_country_name + "</td></tr>";
	    $("#country-table-body").append(element_string);
	});

	// Add click handler for countries table
	$(".country-label").click(function() {
	    currCountry = $(this).attr("data-country");
	    $("#country-table-body tr.info").each(function () {
		$(this).removeClass("info");
	    });
	    $(this).parent().addClass("info");
	    mapReady();
	});
	
	country_code_map_loaded();
    });
});

function country_code_map_loaded() {
    var domainCount = 0,
        searchText,
        mapOptions = '';

    // Load list of available domains for the date
    $.get( "/api/list_all_domains/countries_by_domain/" + date, function( data ) {
	// Populate dropdown menus and turn into jQuery UI widgets
	$.each(data, function (index, domain) {
	    mapOptions += '<option value="' + domain + '">' + domain + '</option>';
	    domainCount += 1;
        });
	searchText = 'Search ' + domainCount + ' domains';
	$("#mapDropdown").append(mapOptions).combobox();
	
	// Trigger change event to load map on startup	
	if (location.hash) {
            $('#mapDropdown').val(location.hash.substr(1) + '.js');
	} else { // for IE9
            // $($('#mapDropdown option')[0]).attr('selected', 'selected');
	    $('#mapDropdown option[value="' + defaultDomain + '"]').attr('selected', 'selected');
	}
	
	// Change map when item selected in dropdown
	$('#mapDropdown').change(function() {
	    var domain = $("option:selected", this).text();
	    currDomain = domain;
	    mapChange();
	});

	$('#mapDropdown').change();
    });

    // Toggle data labels - Note: Reloads map with new random data
    /*
    $("#chkDataLabels").change(function () {
        showDataLabels = $("#chkDataLabels").attr('checked');
        $("#mapDropdown").change();
    });
    */
}

// When map to load has changed
function mapChange() {
    // Show loading
    if ($("#map-container").highcharts()) {
        $("#map-container").highcharts().showLoading('<i class="fa fa-spinner fa-spin fa-2x"></i>');
    }

    // Show loading for chart
    if ($("#chart-container").highcharts()) {
        $("#chart-container").highcharts().showLoading('<i class="fa fa-spinner fa-spin fa-2x"></i>');
    }

    // Fetch data for the current domain on the current date
    $.get( "/api/countries_by_domain/" + currDomain + "/" + date, function( data ) {
	country_to_country = data;
	    
        // Check whether the map is already loaded, else load it and
        // then show it async
        if (Highcharts.maps[mapKey]) {
	    mapReady();
        } else {
	    $.getScript(javascriptPath, mapReady);
        }
    });

    // Populate similar domains tables below chart
    $.get( "/api/similar_domains/" + currDomain + "/" + date, function( data ) {
	$("#domain-table-body-0").empty();
	$("#domain-table-body-1").empty();
	$("#domain-table-body-2").empty();
	$("#domain-table-body-3").empty();

	$.each(data, function (i) {
	    var domain = data[i];
	    var class_string = "";
	    if (domain == currDomain) {
		class_string = "info";
	    }
	    var element_string = "<tr class='" + class_string + "'><td class='domain-label' data-domain='" + domain + "'>" + domain + "</td></tr>";

	    // Distribute the domains across the 4 tables
	    if (0 <= i && i < data.length / 4) {
		$("#domain-table-body-0").append(element_string);
	    } else if (data.length / 4 <= i && i < data.length / 2) {
		$("#domain-table-body-1").append(element_string);
	    } else if (data.length / 2 <= i && i < 3 * data.length / 4) {
		$("#domain-table-body-2").append(element_string);
	    } else {
		$("#domain-table-body-3").append(element_string);
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
	    currDomain = value;
	    $('#mapDropdown').val(value);
	    $('#mapDropdown').change();
	});
    });
}

// When the map is loaded or ready from cache...
function mapReady() {
    var mapGeoJSON = Highcharts.maps[mapKey],
	data = [],
	parent,
	match;

    // Update info box download links
    $("#download").html(
        '<a class="button" target="_blank" href="http://jsfiddle.net/gh/get/jquery/1.11.0/' +
            'highslide-software/highcharts.com/tree/master/samples/mapdata/' + mapKey + '">' +
            'View clean demo</a>' +
            '<div class="or-view-as">... or view as ' +
            '<a target="_blank" href="' + svgPath + '">SVG</a>, ' +
            '<a target="_blank" href="' + geojsonPath + '">GeoJSON</a>, ' +
            '<a target="_blank" href="' + javascriptPath + '">JavaScript</a>.</div>'
    );

    // Fetch data for the current domain & country for the timeseries chart
    $.get( "/api/chart_for_domain/" + currDomain + "?country=" + currCountry, function (data) { chartChange( data ) } );

    // Load data for the currently selected country
    if (currCountry == '') {
	// Sum the data for all countries
	var all_country_data = {};
	$.each(country_to_country, function(fromCountry, currCountryData) {
	    $.each(currCountryData, function (toCountry, value) {
		if (toCountry !== "undefined") {
		    if (all_country_data[toCountry.toLowerCase()]) {
			all_country_data[toCountry.toLowerCase()] += value;
		    } else {
			all_country_data[toCountry.toLowerCase()] = value;
		    }
		}
	    });
	});
	$.each(all_country_data, function(country, value) {
	    data.push({
		key: country,
		value: value
	    });
	});
    } else {
	var currCountryData = country_to_country[currCountry];
	if (currCountryData) {
	    $.each(currCountryData, function (toCountry, value) {
		if (toCountry !== "undefined") {
		    data.push({
			key: toCountry.toLowerCase(),
			value: value
		    });
		}
	    });
	}
    }

    var seriesName = "All Countries";
    if (currCountry != "") {
	seriesName = country_code_map[currCountry];
    }
    
    // Instantiate chart
    $("#map-container").highcharts('Map', {

        title: {
            text: null
        },

        mapNavigation: {
            enabled: true
        },

        colorAxis: {
            min: 0,
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
                    // On click, look for a detailed map
		    click: function () {
			/*
			var key = this.key;
			$('#mapDropdown option').each(function () {
			    if (this.value === 'countries/' + key.substr(0, 2) + '/' + key + '-all.js') {
				$('#mapDropdown').val(this.value).change();
			    }
			});
			*/
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
    var country = 'All Countries';
    if (currCountry != '') {
	country = country_code_map[currCountry];
    }
    $('#chart-container').highcharts({
        title: {
            text: 'Resolutions for ' + currDomain + ' in ' + country
        },
        xAxis: {
            type: 'datetime'
        },
        yAxis: {
            title: {
                text: 'Percent of total'
            }
        },
        tooltip: {
            pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.percentage:.1f}%</b> ({point.y:,.2f})<br/>',
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
            }
        },
        series: data
    });
}

// Add click handler for "Single Domain" button
$("#single-domain").click(function() {
    // Switch active buttons, enable input, show other sites
    $('#all-domains').removeClass('active');
    $(this).addClass('active');
    $('.custom-combobox input').prop('disabled', false);
    $('#other-sites-container').show();
    
    currDomain = defaultDomain;
    $('#mapDropdown').val(currDomain);
    $('#mapDropdown').change();
});

// Add click handler for "All Domains" button
$("#all-domains").click(function() {
    // Switch active buttons, disable input, hide other sites
    $('#single-domain').removeClass('active');
    $(this).addClass('active');
    $('.custom-combobox input').prop('disabled', true);
    $('#other-sites-container').hide();
    
    currDomain = 'All Domains';
    mapChange();
});
