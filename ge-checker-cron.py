#!/usr/bin/python

# Note: for setting up email with sendmail, see: http://linuxconfig.org/configuring-gmail-as-sendmail-email-relay

from subprocess import check_output
from datetime import datetime
from os import getcwd
import sys, smtplib, json
from cStringIO import StringIO
from getopt import getopt
from argparse import ArgumentParser
from time import sleep

flags = {}

def log(msg):
    if flags.verbose:
        print msg

    if not 'logfile' in settings or not settings['logfile']: return
    with open(settings['logfile'], 'a') as logfile:
        logfile.write('%s: %s\n' % (datetime.now(), msg))

def send_apt_available_email(current_apt, avail_apt, scheduled):
    log('Attempting to send notification email...')
    message = """From: %s
To: %s
Subject: Alert: New Global Entry Appointment Available
Content-Type: text/html

<p>Good news! There's a new Global Entry appointment available on <b>%s</b> (your current appointment is on %s).</p>

<p>If this sounds good, please sign in to https://goes-app.cbp.dhs.gov/main/goes to reschedule.</p>
""" % (settings['email_from'], ', '.join(settings['email_to']), avail_apt.strftime('%B %d, %Y'), current_apt.strftime('%B %d, %Y'))
    if (scheduled):
        message = """From: %s
To: %s
Subject: Alert: New Global Entry Appointment Scheduled
Content-Type: text/html

<p>Good news! An earlier Global Entry appointment is available and has been scheduled for you on <b>%s</b></p>

<p>Your previous appointment was on %s.</p>

""" % (settings['email_from'], ', '.join(settings['email_to']), avail_apt.strftime('%B %d, %Y'), current_apt.strftime('%B %d, %Y'))
    try:
        server = smtplib.SMTP('localhost')
        server.sendmail(settings['email_from'], settings['email_to'], message)
        server.quit()
    except Exception as e:
        log(e)

if __name__ == '__main__':
    PWD = getcwd()
    parser = ArgumentParser()
    parser.add_argument('-s', '--schedule', action='store_true')
    parser.add_argument('-r', '--repeat', action='store_true')
    parser.add_argument('-v', '--verbose', action='store_true')
    flags = parser.parse_args()

    # Get settings
    try:
        with open('%s/config.json' % PWD) as json_file:    
            settings = json.load(json_file)
    except Exception as e:
        print 'Error extracting config file: %s' % e

    if not 'email_from' in settings or not settings['email_from']:
        print 'Missing from address in config'
        sys.exit()
    if not 'email_to' in settings or not settings['email_to']:
        print 'Missing to address in config'
        sys.exit()

    available = False
    cmd = ['phantomjs', '%s/ge-cancellation-checker.phantom.js' % PWD, '-p'];
    if (flags.schedule):
        cmd.append('-s')
    while not available:
        new_apt_str = check_output(cmd); # get string from PhantomJS script - formatted like 'Jul 20, 2015\Earlier appt available\nJuly 22, 2015'
        aptStream = StringIO(new_apt_str)
        curDate = datetime.strptime(aptStream.readline().strip(), '%b %d, %Y %H:%M')
        available = (aptStream.readline().strip() == 'Earlier appt available')
        newDate = datetime.strptime(aptStream.readline().strip(), '%B %d, %Y %H:%M')
        new_apt_str = new_apt_str.strip()
        if (not available):
            log('No new appointments. Next available on %s (current is on %s)' % (newDate, curDate))
            if (not flags.repeat):
                sys.exit(0)
            sleep(settings['period']*60)
    send_apt_available_email(curDate, newDate, flags.schedule)
