var system = require('system');
var fs = require('fs');

var schedule = false,
    loadInProgress = false,
    verbose = false;
// XXX: send text/email notifications when rescheduling
// XXX: accept arguments to automatically recheck
// Calculate path of this file

system.args.forEach(function(val, i) {
    if (val == '-s' || val == '--schedule') { schedule = true; }
    if (val == '-v' || val == '--verbose') { verbose = true; }
});

// Read settings from JSON
try {
    var settings = JSON.parse(fs.read(fs.absolute('config.json')));
    if (!settings.logfile)
        console.log('No logfile specified. Please specify logfile in' +
                'config.json');
    if (!settings.username || !settings.password || !settings.init_url || !settings.enrollment_location_id) {
        console.log('Missing username, password, enrollment location ID, and/or initial URL. Exiting...');
        phantom.exit();
    }
}
catch(e) {
    console.log(e + ' Could not find config.json');
    phantom.exit();
}

// Set up log file
try {
    var logfile = fs.open(fs.absolute(settings.logfile), 'a');
    phantom.aboutToExit.connect(logfile.flush);
    logfile.writeLine(Date().toString() + ' GOES APPOINTMENT CHECKER');
    logfile.flush();
}
catch(e) {
    console.log(e + ' Issue opening log file');
}

// Write to log
function log(msg) {
    logfile.writeLine(Date().toString() + ' ' + msg);
    if (verbose) { console.log(msg); }
    logfile.flush();
}

// Open and set up page
var page = require('webpage').create();
page.open(settings.init_url);
page.onConsoleMessage = function(msg) {
    log(msg);
};

page.onError = function(msg, trace) {
    return;
    console.error('Error on page: ' + msg);
}

page.onCallback = function(query, msg) {
    if (query == 'username') { return settings.username; }
    if (query == 'password') { return settings.password; }
    if (query == 'enrollment_location_id') {
        return settings.enrollment_location_id.toString(); }
    if (query == 'schedule') { return schedule; }
    if (query == 'curDate') {
        if (msg) { curDate = msg; return; }
        else { return curDate; }
    }
    if (query == 'earlierApptAvail') {
        if (msg) { earlierApptAvail = true; return; }
        else { return earlierApptAvail; }
    }
    if (query == 'report-interview-time') {
        log('Next available appointment is at: ' + msg);
        return;
    }
    if (query == 'fatal-error') {
        log('Fatal error: ' + msg);
        phantom.exit();
    }
    return null;
}

page.onLoadStarted = function() { loadInProgress = true; };
page.onLoadFinished = function() { loadInProgress = false; };

var steps = [
function() { // Login
    page.evaluate(function() {
        console.log('Logging in...');
        document.querySelector('input[name=username]').value =
        window.callPhantom('username');
        document.querySelector('input[name=password]').value =
        window.callPhantom('password');
        document.querySelector('input[name="Sign In"]').click();
    });
},
    function() { // Accept terms of agreement
        page.evaluate(function() {
            console.log('Accepting terms...');
            document.querySelector('a[href="/main/goes/HomePagePreAction.do"]').click();
        });
    },
    function() { // Read new
        page.evaluate(function() {
            console.log('Entering appointment management...');
            document.querySelector('.bluebutton[name=manageAptm]').click();
        });
    },
    function() {
        page.evaluate(function() {
            console.log('Entering rescheduling selection page...');
            // Current date XXX: clean up this search
            date = document.querySelector(".maincontainer p:nth-child(7)").innerHTML.replace(/<strong>[\s\S]*?<\/strong>/, "");
            window.callPhantom('curDate', date);
            document.querySelector('input[name=reschedule]').click();
        });
    },
    function() {
        page.evaluate(function() {
                console.log('Selecting enrollment center...');
                document.querySelector('select[name=selectedEnrollmentCenter]').value = window.callPhantom('enrollment_location_id');
                document.querySelector('input[name=next]').click();
                });
    },
    function() {
        page.evaluate(function() {
            console.log('Checking for earlier appointment...');
            // We made it! Now we have to scrape the page for the earliest available date

            var date = document.querySelector('.date table tr:first-child td:first-child').innerHTML;
            var month_year = document.querySelector('.date table tr:last-child td:last-child div').innerHTML;
            var futDate = month_year.replace(',', ' ' + date + ',');
            var curDate = window.callPhantom('curDate');
            var schedule = window.callPhantom('schedule');
            if(Date.parse(futDate).valueOf() < Date.parse(curDate).valueOf()) {
                window.callPhantom('earlierApptAvail', true);
                console.log('Sooner appt available: ' + futDate);
                if (schedule) {
                    document.querySelector('a[href="#"].entry').onmouseup();
                }
            }
        });
    },
    function() {
        if( window.callPhantom('earlierApptAvail') && schedule ) {
            page.evaluate( function() {
                console.log('Scheduling earlier appointment');
                document.querySelector('input[name=comments]').value = "Earlier appointment";
                document.querySelector('input[name=Confirm]').click();
            });
        }
    }
];

var i = 0;
interval = setInterval(function() {
    if (loadInProgress) { return; } // not ready yet...
    if (typeof steps[i] != "function") {
        return phantom.exit();
    }
    var curDate;
    var earlierApptAvail = false;
    steps[i]();
    i++;

}, 100);
