async = require "async"
moment = require "moment"
fs = require 'fs'
path = require 'path'
log = require('printit')
    prefix: null
    date: true

importer = require "./importer"
konnectorHash = require './konnector_hash'
Konnector = require '../models/konnector'

hour = 60 * 60 * 1000
day = 24 * hour
week = 7 * day
month = 30 * day
format = "DD/MM/YYYY [at] HH:mm:ss"
periods = {hour, day, week, month}


# Glossary:
#
# timeout = import function that will be executed in x time
# update = import date
# check = check if an import timeout is needed and create it.
#
# The poller runs imports for each konenctor based on the interval length given
# by the user.

class KonnectorPoller


    constructor: ->
        # Timeout for prepareNextCheck (call every day)
        @timeout = null

        # Timeouts for all konnectors
        #    * Contains only timeout for the current day
        @timeouts = {}

        # Upcoming import dates for each konnector.
        @nextUpdates = {}


    # Find next update date for given konnector and save it in nextUpdates
    # field.
    initializeKonnectorUpdates: (konnector) ->
        nextUpdate = @findNextUpdate konnector
        @nextUpdates[konnector.slug] = [nextUpdate, konnector]


    # Compute next update for <konnector>
    findNextUpdate: (konnector) ->
        now = moment()
        importInterval = periods[konnector.importInterval]
        lastImport = moment konnector.lastImport
        lastAutoImport = moment konnector.lastAutoImport

        # If we missed an importation cycle
        if (now.valueOf() - lastAutoImport.valueOf()) > importInterval
            log.debug "#{konnector.slug} missed an importation cycle"

            # We import now
            importer konnector
            importTime = now

            slug = konnector.slug
            time = importTime.format(format)
            log.debug "#{slug} | Next update: #{time}"

            return importTime

        # If we didn't missed an import interval
        else
            if lastAutoImport.valueOf() > now.valueOf()
                # possible if user gave a start date for auto import
                # TODOS : manage start date in other field than lastAutoImport
                nextUpdate = lastAutoImport
            else
                nextUpdate = lastAutoImport.add importInterval, 'ms'

            slug = konnector.slug
            time = nextUpdate.format(format)
            log.debug "#{slug} | Next update: #{time}"

            return nextUpdate


    # For all konnectors check if an import timeout is needed.
    # Creates it if needed.
    # Set the next checking period to be run in 24h.
    manageNextChecks: ->

        # Initialize every day to avoid to have lots of long timeout.
        @prepareNextCheck()
        clearTimeout @timeout if @timeout?
        @timeout = setTimeout @start.bind(@), day


    # For all konnectors check if an import timeout is needed.
    # Creates it if needed.
    prepareNextCheck: ->
        for slug, val of @nextUpdates
            [nextUpdate, konnector]  = val
            @createTimeout konnector, nextUpdate


    # If the import should be run in less than 24h, creates it.
    # It is created only if it fits in the period before the next checking.
    createTimeout: (konnector, nextUpdate) ->
        now = moment()
        interval = nextUpdate.diff now.clone(), 'ms'
        if interval < day
            @startTimeout konnector, interval


    # Set up the timeout and save its reference into the timeout hash.
    startTimeout: (konnector, interval) ->
        nextImport = @runImport.bind @, konnector, interval
        clearTimeout @timeouts[konnector.slug] if @timeouts[konnector.slug]?
        @timeouts[konnector.slug] = setTimeout nextImport, interval


    # Run import. Then it sets the date for the next import. Finally,
    # it saves information in the nextUpdate hash and sets the import timeout
    # if it fits in the 24h period.
    runImport: (konnector, interval) ->
        importer konnector # This function is asynchronous.
        now = moment()
        nextUpdate = now.add periods[konnector.importInterval], 'ms'
        @create konnector, nextUpdate


    # Add konnector and the next import date to the nextUpdates hash.
    # Create import timeout if needed.
    create: (konnector, nextUpdate) ->
        @nextUpdates[konnector.slug] = [nextUpdate, konnector]

        log.info "#{konnector.slug} : Next update #{nextUpdate.format(format)}"
        @createTimeout konnector, nextUpdate


    # Update import timeout and nextUpdates for this konnector that was
    # modiffied or newly created.
    add: (startDate, konnector, callback=null) ->

        # if there is already a timeout for this konnector, destroy it
        if @timeouts[konnector.slug]?
            clearTimeout @timeouts[konnector.slug]
            delete @timeouts[konnector.slug]

        if konnector.importInterval isnt 'none'
            konnector.injectEncryptedFields()

            if startDate?

                # Next import will start at start date
                data = lastAutoImport: moment(startDate, "DD-MM-YYYY")
                fields = konnectorHash[konnector.slug]
                konnector.removeEncryptedFields fields

                konnector.updateAttributes data, (err, body) =>
                    log.error err if err

                    @create konnector, data.lastAutoImport
                    callback() if callback?

            else

                # Next import is run now and the next import timeout is
                # set.
                data = lastAutoImport: new Date()
                konnector.lastAutoImport = date.lastAutoImport
                fields = konnectorHash[konnector.slug]
                konnector.removeEncryptedFields fields

                konnector.updateAttributes data, (err, body) ->
                    log.error err if err?

                    @create konnector, @findNextUpdate(konnector)
                    callback() if callback?

        else
            callback() if callback?


    # Determine for each konnector, the next import dates. Then run imports
    # that should be started.
    start: (reset=false, callback=null) ->
        log.debug "Launching Konnector Poller..."

        @nextUpdates = {} if reset

        if Object.keys(@nextUpdates).length is 0

            # First initialization
            Konnector.all (err, konnectors) =>

                async.eachSeries konnectors, (konnector, next) =>
                    # If both importInterval and lastAutoImport are valid
                    if konnector.importInterval? \
                    and konnector.importInterval isnt 'none' \
                    and konnector.lastAutoImport? \
                    and konnectorHash[konnector.slug]?
                        @initializeKonnectorUpdates konnector
                    next()

                , (err) =>
                    callback() if callback?
                    @manageNextChecks()

        else
            callback() if callback?
            @manageNextChecks()


module.exports = new KonnectorPoller

