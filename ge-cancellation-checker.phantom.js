var system = require('system');
var fs = require('fs');

var VERBOSE = false;
var loadInProgress = false;
// XXX: log to file not console
// XXX: send text/email notifications when rescheduling
// XXX: accept arguments to automatically recheck and schedule vs not schedule
// Calculate path of this file
var PWD = fs.workingDirectory;

console.log("testing1");
// Gather Settings...
try {
    var settings = JSON.parse(fs.read(PWD + '/config.json'));
    if (!settings.logfile)
        console.log('No logfile specified. Please specify logfile in config.json');
    var logfile = PWD + '/' + settings.logfile;
    if (!settings.username || !settings.password || !settings.init_url || !settings.enrollment_location_id) {
        console.log('Missing username, password, enrollment location ID, and/or initial URL. Exiting...');
        phantom.exit();
    }
}
catch(e) {
    console.log('Could not find config.json');
    phantom.exit();
}

var page = require('webpage').create();
page.open(settings.init_url);
page.onConsoleMessage = function(msg) {
    console.log(msg);
};

page.onError = function(msg, trace) {
    if (!VERBOSE) { return; }
    console.error('Error on page: ' + msg);
}

page.onCallback = function(query, msg) {
    if (query == 'username') { return settings.username; }
    if (query == 'password') { return settings.password; }
    if (query == 'enrollment_location_id') { return settings.enrollment_location_id.toString(); }
    if (query == 'cur_date') { if (msg) { cur_date = msg; return; } else { return cur_date; } }
    if (query == 'schedule') { if (msg) { schedule = true; return; } else { return schedule; } }
    if (query == 'report-interview-time') {
        if (VERBOSE) { console.log('Next available appointment is at: ' + msg); }
        console.log(msg);
        return;
    }
    if (query == 'fatal-error') {
        console.log('Fatal error: ' + msg);
        phantom.exit();
    }
    return null;
}

page.onLoadStarted = function() { loadInProgress = true; };
page.onLoadFinished = function() { loadInProgress = false; };

var steps = [
    function() {
        page.evaluate(function() {
            console.log('On GOES login page...');
            document.querySelector('input[name=username]').value = window.callPhantom('username');
            document.querySelector('input[name=password]').value = window.callPhantom('password');
            document.querySelector('input[name="Sign In"]').click();
        });
    },
    function() {
        page.evaluate(function() {
            console.log('Logging in...');
            document.querySelector('a[href="/main/goes/HomePagePreAction.do"]').click();
        });
    },
    function() {
        page.evaluate(function() {
            console.log('Accepting terms...');
            document.querySelector('.bluebutton[name=manageAptm]').click();
        });
    },
    function() {
        page.evaluate(function() {
            console.log('Entering appointment management...');
            // Current date XXX: clean up this search
            date = document.querySelector(".maincontainer p:nth-child(7)").innerHTML.replace(/<strong>[\s\S]*?<\/strong>/, "");
	    window.callPhantom('cur_date', date);
            document.querySelector('input[name=reschedule]').click();

        });
    },
    function() {
        page.evaluate(function() {
            console.log('Entering rescheduling selection page...');
            document.querySelector('select[name=selectedEnrollmentCenter]').value = window.callPhantom('enrollment_location_id');
            document.querySelector('input[name=next]').click();
        });
    },
    function() {
        page.evaluate(function() {
            console.log('Choosing SFO...');

            // We made it! Now we have to scrape the page for the earliest available date

            var date = document.querySelector('.date table tr:first-child td:first-child').innerHTML;
            var month_year = document.querySelector('.date table tr:last-child td:last-child div').innerHTML;
            var fut_date = month_year.replace(',', ' ' + date + ',');
	    var cur_date = window.callPhantom('cur_date');
	    console.log(fut_date + ' ? ' + cur_date);
	    if( Date.parse(fut_date).valueOf() < Date.parse(cur_date).valueOf() ) {
	        window.callPhantom('schedule', true);
		console.log('Sooner appt available: ' + fut_date);
		console.log(document.querySelector('.entry'));
	    	document.querySelector('a[href="#"].entry').onmouseup()
	    }
        });
    },
    function() {
	if( window.callPhantom('schedule') ) {
	    page.evaluate( function() {
                document.querySelector('input[name=comments]').value = "Earlier appointment";
                document.querySelector('input[name=Confirm]').click();
            } );
	}
	return;
    }
];

var i = 0;
interval = setInterval(function() {
    if (loadInProgress) { return; } // not ready yet...
    if (typeof steps[i] != "function") {
        return phantom.exit();
    }
    var cur_date;
    var schedule = false;
    steps[i]();
    i++;

}, 100);
