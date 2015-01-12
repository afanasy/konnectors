BaseView = require '../lib/base_view'

module.exports = class MenuItemView extends BaseView

    tagName: 'li'
    template: require './templates/menu_item'


    initialize: (options) ->
        super options
        @listenTo @model, 'change', @render


    getRenderData: ->
        lastImport = @model.get 'lastImport'
        if @model.isConfigured() and lastImport?
            lastImport = "#{t 'last import:'}  #{moment(lastImport).format 'LLL'}"
        else if @model.isConfigured()
            lastImport = "No import performed yet"
        else
            lastImport = ""

        return _.extend {}, super(), {lastImport}

    afterRender: ->
        # change style if the konnector is used by the user
        if @model.isConfigured()
            @$el.addClass 'configured'


    select: -> @$el.addClass 'selected'


    unselect: -> @$el.removeClass 'selected'
