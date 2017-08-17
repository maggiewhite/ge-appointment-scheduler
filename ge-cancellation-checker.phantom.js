var system = require('system');
var fs = require('fs');

var schedule = false,
    loadInProgress = false,
    verbose = false,
    curDate,
    newDate,
    python = false,
    debug = false,
    error = false,
    earlierApptAvail = false;

// XXX: send text/email notifications when rescheduling
// XXX: accept arguments to automatically recheck
// Calculate path of this file

system.args.forEach(function(val, i) {
    if (val == '-s' || val == '--schedule') { schedule = true; }
    if (val == '-v' || val == '--verbose') { verbose = true; }
    if (val == '-p' || val == '--python') { python = true; }
});

// Read settings from JSON
try {
    var settings = JSON.parse(fs.read(fs.absolute('config.json')));
    if (!settings.logfile)
        console.log('No logfile specified. Please specify logfile in' +
                'config.json');
    // Confirm JSON is loaded. Is this and python checks really necessary?
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
    phantom.aboutToExit.connect(logfile.close);
    logfile.writeLine(Date().toString() + ' GOES APPOINTMENT CHECKER');
    logfile.flush();
}
catch(e) {
    console.log(e + ' Issue opening log file');
}

// Write to log
function log(msg, pri) {
    // XXX: pretty sure this will fail if log file doesn't open correctly
    logfile.writeLine(Date().toString() + ' ' + msg);
    if (verbose || pri) { console.log(msg); }
    logfile.flush();
}

function pythonlog() {
    if (python) {
        console.log(curDate);
        if (earlierApptAvail==true)
            console.log("Earlier appt available");
        else
            console.log("Earlier appt unavailable");
        console.log(newDate); 
    }
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
    if (query == 'schedule') {
        return schedule; }
    if (query == 'curDate') {
        if (msg) { curDate = msg; return; }
        else { return curDate; }
    }
    if (query == 'newDate') { newDate = msg; }
    if (query == 'earlierApptAvail') {
        if (msg) {
            earlierApptAvail = true;
            return; }
        else {
            return earlierApptAvail; }
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
            try {
                document.querySelector('input[name=j_username]').value =
                window.callPhantom('username');
                document.querySelector('input[name=j_password]').value =
                window.callPhantom('password');
                document.querySelector('input[name="Sign In"]').click();
            }
            catch (err) {
                console.log(err);
                error = true;
            }
        });
    },
    function() { // Accept terms of agreement
        page.evaluate(function() {
            console.log('Accepting terms...');
            try {
            document.querySelector('input[name=checkMe]').click();
            }
            catch (err) {
                console.log(err);
                error = true;
            }
        });
    },
    function() { // Appointment management button
        page.evaluate(function() {
            console.log('Entering appointment management...');
            try {
                document.querySelector('.bluebutton[name=manageAptm]').click();
            }
            catch (err) {
                console.log(err);
                error = true;
            }
        });
    },
    function() { // Collect current date
        page.evaluate(function() {
            // Current date XXX: clean up this search
            console.log("Get the earliest reschedule date...");
            try {
            // TODO: make this less fragile, search by "Interview Date: " not spot in table
            date = document.querySelector(".maincontainer p:nth-child(6)").innerHTML.replace(/<strong>[\s\S]*?<\/strong>/, "");
            date += " " + document.querySelector(".maincontainer p:nth-child(7)").innerHTML.replace(/<strong>[\s\S]*?<\/strong>/, "");
            window.callPhantom('curDate', date);
            console.log('Current date found: ' + date);
            document.querySelector('input[name=reschedule]').click();
            }
            catch (err) {
                console.log(err);
                error = true;
            }
        });
    },
    function() { // Select enrollment center
        page.evaluate(function() {
                console.log('Selecting enrollment center ' + window.callPhantom('enrollment_location_id'));
                try {
                document.querySelector('[value="' + window.callPhantom('enrollment_location_id') + '"]').click();
                document.querySelector('input[name=next]').click();
                }
                catch (err) {
                    console.log(err);
                    error = true;
                }
                });
    },
    function() { // Check next available appointment
        page.evaluate(function() {
            console.log('Checking for earlier appointment...');
            // We made it! Now we have to scrape the page for the earliest available date
            try {
            var date = document.querySelector('.date table tr:first-child td:first-child').innerHTML;
            var month_year = document.querySelector('.date table tr:last-child td:last-child div').innerHTML;
            var newDate = month_year.replace(',', ' ' + date + ',');
            newDate += " " + document.querySelector('a[href="#"].entry span').innerHTML;
            console.log('Next date is ' + newDate);
            window.callPhantom('newDate', newDate);
            var curDate = window.callPhantom('curDate');
            if(Date.parse(newDate).valueOf() < Date.parse(curDate).valueOf()) {
                window.callPhantom('earlierApptAvail', true);
                // XXX: format this for python script
                console.log('Earlier appt available on ' + newDate);
                var schedule = window.callPhantom('schedule');
                if (schedule) {
                    document.querySelector('a[href="#"].entry').onclick();
                }
            }}
            catch (err) {
                console.log(err);
                error = true;
            }
        });
    },
    function() { // Confirm scheduling appointment
        pythonlog();
        if( earlierApptAvail && schedule ) {
            page.evaluate( function() {
                try {
                console.log('Scheduling earlier appointment');
                document.querySelector('input[name=comments]').value = "Found earlier appointment";
                document.querySelector('input[name=Confirm]').click();
                }
                catch (err) {
                    console.log(err);
                    error = true;
                }
            });
        }
    } // XXX: confirm appointment scheduled. can't do this without losing my appointment
];

var i = 0;
interval = setInterval(function() {
    if (loadInProgress) { return; } // not ready yet...
    if (typeof steps[i] != "function") {
        return phantom.exit();
    }
    steps[i]();
    if (error) {
        phantom.exit();
        clearInterval(interval);
    }
    i++;
}, 100);
