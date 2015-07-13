// Mutable variables
var currCountry = 'US',
    country_code_map = {},
    country_to_country,  // Currently loaded country->country clustering data
    date = "06-29-2015"; // TODO - add date picker

// Immutable variables
var baseMapPath = "http://code.highcharts.com/mapdata/",
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
	
	// Update country selection sidebar
	$.each(data, function (country_code) {
	    var friendly_country_name = country_code_map[country_code];
	    var class_string = "";
	    if (country_code === currCountry) {
		// Currently selected country
		class_string = "info";
	    }
	    // Add f32 flag icon to row
	    var flag_string = '<td><span class="f32"><span class="flag ' + country_code.toLowerCase() + '" id="flag"></span></span></td>';
	    var element_string = "<tr class='" + class_string + "'>" + flag_string + "<td class='country-label' data-country='" + country_code + "'>" + friendly_country_name + "</td></tr>";
	    $("#country-table-body").append(element_string);
	});

	// Add click handler for countries table
	$(".country-label").click(function() {
	    currCountry = $(this).attr("data-country");
	    $("#country-table-body tr").each(function () {
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
            $($('#mapDropdown option')[0]).attr('selected', 'selected');
	}
	
	// Change map when item selected in dropdown
	$('#mapDropdown').change(function() {
	    var domain = $("option:selected", this).text();
	    mapChange(domain);
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
function mapChange(currDomain) {
    // Show loading
    if ($("#container").highcharts()) {
        $("#container").highcharts().showLoading('<i class="fa fa-spinner fa-spin fa-2x"></i>');
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

    // Load data for the currently selected country
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

    // Instantiate chart
    $("#container").highcharts('Map', {

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
            name: 'Similarity to ' + country_code_map[currCountry],
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
			var key = this.key;
			$('#mapDropdown option').each(function () {
			    if (this.value === 'countries/' + key.substr(0, 2) + '/' + key + '-all.js') {
				$('#mapDropdown').val(this.value).change();
			    }
			});
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
