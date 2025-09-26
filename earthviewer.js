(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var app = require("./app.js");
var _ = require("underscore");

// Renders events from the timeline on the globe.
function EventIcons() {
    var that = this;
    _.bindAll(this, "updateEvents", "loadEvents");

    app.clock.on("timeChanged", this.updateEvents);
    app.timeline.on("sectionChanged", this.updateEvents);
    app.timeline.on("loaded", this.loadEvents);
    app.eventFilter.on("filterChanged", this.updateEvents);

    // Setup a handler for picking the events
    // If the mouse is over the billboard, change its scale and color
    var handler = new Cesium.ScreenSpaceEventHandler(app.viewer.scene.canvas);
    handler.setInputAction(function(movement) {
        var pickedObject = app.viewer.scene.pick(movement.position);
        if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id) && Cesium.defined(pickedObject.id.event)) {
            // Show the overlay
            if (pickedObject.id.event.href && pickedObject.id.event.href.length !== 0) {
                app.showEvent(pickedObject.id.event);
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

}

EventIcons.prototype.addEvent = function(e, section) {
    var scale = 0.5;
    var position = Cesium.Cartesian3.fromDegrees(e.lon, e.lat);
    var entity = app.viewer.entities.add({
        position: position,
        label: {
            text: e.name,
            verticalOrigin : Cesium.VerticalOrigin.TOP,
            scale: scale
        },
        billboard: {
            image: e.icon,
            verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
            scale: scale
        }
    });
    entity.event = e;
    entity.section = section;
    return entity;
};

EventIcons.prototype.loadEvents = function() {
    var numEvents = 0;
    for (var i = 0; i < app.timeline.sections.length; i++)
    {
        var section = app.timeline.sections[i];
        for (var j = 0; j < section.events.length; j++)
        {
            var evt = section.events[j];
            if (!isNaN(evt.start) && !isNaN(evt.end) && !isNaN(evt.lat) && !isNaN(evt.lon))
            {
                this.addEvent(evt, section);
                numEvents += 1;
            }
        }        
    }
   // console.log("Loaded " + numEvents + " events");

    this.updateEvents();
};

EventIcons.prototype.updateEvents = function() {
    var startTime = new Date().getTime();

    var time = app.clock.time;
    var section = app.timeline.sections[app.timeline.currentSection];

    var entities = app.viewer.entities.values;

    for (var i = 0; i < entities.length; i++)
    {
        var entity = entities[i];
        if (_.has(entity, "event"))
        {
            if (entity.section == section && entity.event.start <= time && entity.event.end > time && app.eventFilter.passes( entity.event )) {
                entity.show = true;
            }
            else {
                entity.show = false;
            }
        }
    }


    var endTime = new Date().getTime();
    //console.log("updateEvents took " + (endTime - startTime) + " ms");
};

module.exports = EventIcons;
},{"./app.js":4,"underscore":22}],2:[function(require,module,exports){
var _ = require("underscore");

function FlyTo(viewer, destination, duration) {
    _.bindAll(this, "update", "cancel");
    this.startTime = null;
    this.viewer = viewer;
    this.destination = destination;
    this.duration = duration;
    this.currentTime = 0.0;
    this.startPosition = this.viewer.camera.positionCartographic;
 
    this.ellipsoid = new Cesium.EllipsoidGeodesic(this.viewer.camera.positionCartographic, destination);

    this.viewer.scene._postRender.addEventListener(this.update);

    this.canceled = false;
}

FlyTo.prototype.update = function(scene, time) {
    if (!this.startTime) {
        this.startTime = time;
        console.log("Start time " + this.startTime);
    }
    this.currentTime = Cesium.JulianDate.secondsDifference(time, this.startTime);
 
    var fract = this.currentTime / this.duration;

    var pos = this.ellipsoid.interpolateUsingFraction(fract);
    // Use the start position's height.
    pos.height = this.startPosition.height;

    var dest = this.ellipsoid.ellipsoid.cartographicToCartesian(pos);
    this.viewer.camera.setView({
        destination: dest,
        orientation: { heading: this.viewer.camera.heading, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0.0 }
    });
   
    // Remove this event handler since the animation is done.
    if (this.currentTime > this.duration) {
        this.cancel();
    }
};

FlyTo.prototype.cancel = function() {
    if (!this.canceled) {
        this.viewer.scene._postRender.removeEventListener(this.update);
        this.canceled = true;
    }
};

module.exports = FlyTo;
},{"underscore":22}],3:[function(require,module,exports){
var EventEmitter = require("events").EventEmitter;
var util = require("util");
var _ = require("underscore");
var utils = require("./utils.js");

// A collection of tags used to filter events.
function TagFilter() {
    this.tags = ["city"];
}

util.inherits(TagFilter, EventEmitter);

// Adds a tag to the filter.
TagFilter.prototype.addTag = function(tag) {
    if (!_.contains(this.tags, tag)) {
        this.tags.push(tag);
        this.emit("filterChanged");
    }
};

// Removes a tag from the filter.
TagFilter.prototype.removeTag = function(tag) {
    var index = _.indexOf(this.tags, tag);
    if (index >= 0 ) {
        this.tags.splice(index, 1);
        this.emit("filterChanged");
    }
};

TagFilter.prototype.filter = function(objects) {
    var results = [];
    for (var i = 0; i < objects.length; i++) {
        var o = objects[i];
        if (this.passes(o)) {
            results.push(o);
        }
    }
    return results;
};

TagFilter.prototype.passes = function(o) {
    for (var j = 0; j < this.tags.length; j++) {
        if (utils.hasTag(o, this.tags[j])) {
            return true;
        }
    }
    return false;
};

module.exports = TagFilter;
},{"./utils.js":15,"events":17,"underscore":22,"util":21}],4:[function(require,module,exports){
(function (global){
var Clock = require("./clock.js");
var _ = require("underscore");
var Timeline = require("./timeline.js");
var EventEmitter = require("events").EventEmitter;
var util = require("util");
var TagFilter = require("./TagFilter.js");
var FlyTo = require("./FlyTo.js");


if (window.chrome && chrome.app && chrome.app.runtime && !global.window.nwDispatcher) {
    // Try to dynamically inject the javascript since we are running on chrome proper.  We can't load it 
    // directly in the index.html b/c NWJS doesn't support chrome.storage.local and will fail when it loads.
    var analyticsScript = document.createElement("script");
    analyticsScript.type = "text/javascript";
    analyticsScript.src = "dist/js/google-analytics-bundle.js";
    // Wait for the script to load and then send the tracking event.
    analyticsScript.onload = function() {
        var service = analytics.getService("EarthViewer");
        service.getConfig().addCallback(function(config) {
            config.setTrackingPermitted(true);
        });

        var tracker = service.getTracker("UA-40560638-2");
        tracker.sendEvent("Webapps", 'EarthViewer', 'ChromeStore');
    };
    document.getElementsByTagName("head")[0].appendChild(analyticsScript);
} else {

/* jshint ignore:start */
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
  })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

  ga('create', 'UA-40560638-1', 'none');
  ga('send', 'pageview');
  ga('send', 'event', 'Webapps', 'EarthViewer', 'HHMI');
  /* jshint ignore:end */
}

function App() {
    this.clock = new Clock();
    this.timeline = new Timeline();
    this.eventFilter = new TagFilter();
    _.bindAll(this, "initMap", "updateImages", "loadImages", "onSectionChanged", "checkImageryLayers", "loadHighRes", "checkHighRes", "startAnimating", "stopAnimating", "zoomIn", "zoomOut", "showCoastLines", "hideCoastLines");
    this.timeline.on("loaded", this.loadImages);
    this.clock.on("timeChanged", this.updateImages);
    this.timeline.on("sectionChanged", this.onSectionChanged);
    this.chartVisible = false;
    this.overlayVisible = false;
    this.highResLayer = null;
    this.checkHighResTimeout = null;
    this.animating = false;

    this.loadHighResTimeout = null;

    // Debug, will remove this at some point.
    this.tiled = true;
}
util.inherits(App, EventEmitter);
App.prototype.onSectionChanged = function(section) {
    this.loadImages();
    // set section description overlay text
    $("#main_sectiontext").html(section.description);

};
App.prototype.checkImageryLayers = function() {

    var numLoaded = 0;
    var total = this.viewer.scene.imageryLayers.length;
    
    for (i = 0; i < this.viewer.scene.imageryLayers.length; i++) {
        if (this.viewer.scene.imageryLayers.get(i).imageryProvider.ready) {
            numLoaded += 1;
        }
    }

    console.log("Waiting on " + total + " images loaded=" + numLoaded);

    var loaded = numLoaded === total;
    var percentComplete = Math.round(((numLoaded / total) * 100.0));
    if (percentComplete < 0) percentComplete = 0;
    if (percentComplete > 100) percentComplete = 100;
    
    $("#main_loadprogress").html("Loading...<br/>" + percentComplete + "%");

    if (!loaded) {
        // Temporary.  Show the main splash screen again.
        $("#main_splashscreen").show();
        setTimeout(this.checkImageryLayers, 10);
    }
};
App.prototype.initMap = function() {
    this.viewer = new Cesium.Viewer('cesiumContainer', {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        skyAtmosphere: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        navigationInstructionsInitiallyVisible: false,
        // We only want a 3D scene.
        scene3DOnly: true,
        // We just load something as a placeholder here, this will get wiped out when all the images are loaded later.
        imageryProvider: new Cesium.SingleTileImageryProvider({
                url: 'Resources/Images/Small/snowball.jpg',
                rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
                hasAlphaChannel: false
        })
    });

    // Hide the star field.
    this.viewer.scene.skyBox.show = false;

    // Hide the moon.
    this.viewer.scene.moon.show = false;

    // Disable lighting and the sun rendering.
    this.viewer.scene.globe.enableLighting = false;
    this.viewer.scene.sun.show = false;

    // Increase the maximum screen space error so that we draw less tiles.
    this.viewer.scene.globe.maximumScreenSpaceError = 50;

    // Cool wireframe debugger
    //this.viewer.scene.globe._surface.tileProvider._debug.wireframe = true;

    // This is how you would tweak the FOV of the viewer if you wanted to.
    // this.viewer.scene.camera.frustum.fov = Cesium.Math.toRadians(45);

    this.viewer.scene.screenSpaceCameraController.minimumZoomDistance =  8375000.0;
    this.viewer.scene.screenSpaceCameraController.maximumZoomDistance = 35000000.0;

    //this.viewer.resolutionScale = 1.0 / devicePixelRatio;

    // Disable tilt
    this.viewer.scene.screenSpaceCameraController.enableLook  = false;

    //this.frameRateMonitor = new Cesium.FrameRateMonitor({
    //    scene: this.viewer.scene
    //});

    //this.lastFPS = 0;
    var that = this;
    this.viewer.scene._postRender.addEventListener(function(scene, time) {
        $("#main_splashscreen").hide();
        $("#main_splashscreen").addClass("map");

        //if (that.frameRateMonitor.lastFramesPerSecond) {
        //    var fps = that.frameRateMonitor.lastFramesPerSecond.toFixed();
        //    if (that.lastFPS != fps) {   
        //        that.lastFPS = fps;
        //        $("#fps").html("fps " + fps);
        //    }
        //}
    });

    // Disable the double click on entity action
    this.viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    this.viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);

    $.ajax({
        dataType: "json",
        url: 'Resources/ne_110m_coastline.json',
        success: function( data ) {
            that.coastlines = that.viewer.scene.primitives.add(new Cesium.PolylineCollection());

            var coastlinesMaterial = Cesium.Material.fromType('Color');
            coastlinesMaterial.uniforms.color = Cesium.Color.YELLOW;

            // Loop over all the features
            for (var i = 0; i < data.features.length; i++) {
                var feature = data.features[i];
                var positions = [];
                for (var j = 0; j < feature.geometry.coordinates.length; j++)
                {
                    positions.push( feature.geometry.coordinates[j][0], feature.geometry.coordinates[j][1]);
                }
                var polyline = that.coastlines.add({
                    positions: Cesium.Cartesian3.fromDegreesArray(positions),
                    material: coastlinesMaterial,
                    width: 2.0
                });
                polyline.show = false;
            }            
        }
    });

    this.resetMap();

    this.createGraticule();
};


// Loads all the images for the current section.
App.prototype.loadImages = function() {
    // Remove all existing imagery layers
    this.viewer.scene.imageryLayers.removeAll();

    // Get the current section
    var section = this.timeline.sections[this.timeline.currentSection];

    for (var j = 0; j < section.images.length; j++) {
        var image = section.images[j];

        var layer = null;

        if (!this.tiled) {
            // Load a single image source
            var url = 'Resources/Images/Small/' + image.src + ".jpg";
            layer = this.viewer.scene.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({
                url: url,
                rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90)
            }));
        }
        else {
            layer = this.viewer.scene.imageryLayers.addImageryProvider(new Cesium.TileMapServiceImageryProvider({
                url: "Resources/Images/Small_Tiled/" + image.src,
                tilingScheme: new Cesium.GeographicTilingScheme(),
                fileExtension: "jpg",
                maximumLevel: 0
            }));
        }

        layer.image = image;
        image.layer = layer;
    }

    this.updateImages();
    this.checkImageryLayers();
};


App.prototype.removeHighRes = function() {
    if (this.highResLayer) {
        this.viewer.scene.imageryLayers.remove(this.highResLayer);
        this.highResLayer = null;
    }
};


App.prototype.loadHighRes = function() {
    if (this.activeLayer && this.activeLayer.image) {

        if (!this.tiled) {
            this.highResLayer = new Cesium.ImageryLayer(new Cesium.SingleTileImageryProvider({
                url: 'Resources/Images/Full/' + this.activeLayer.image.src + ".jpg",
                rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
                hasAlphaChannel: false
            }));
        }
        else {
            this.highResLayer = new Cesium.ImageryLayer(new Cesium.TileMapServiceImageryProvider({
                    url: "Resources/Images/Full_Tiled/" + this.activeLayer.image.src,
                    tilingScheme: new Cesium.GeographicTilingScheme(),
                    fileExtension: "jpg",
                    maximumLevel: 0
            }));
        }

        this.highResLayer.alpha = 1.0;
        this.checkHighRes();
        this.loadHighResTimeout = null;
    }
};

App.prototype.checkHighRes = function() {
    
    // Cancel the existing timeout if we have one pending.
    if (this.checkHighResTimeout) {
        clearTimeout(this.checkHighResTimeout);
        this.checkHighResTimeout = null;
    }

    // If the layer is ready, add it to the scene.
    if (this.highResLayer && this.highResLayer.imageryProvider.ready) {
        this.highResLayer.alpha = 1.0;
        this.viewer.scene.imageryLayers.add(this.highResLayer);
        /*
        // Hide all of the other layers
        for (var i = 0; i < this.viewer.scene.imageryLayers.length; i++) {
            var l = this.viewer.scene.imageryLayers.get(i);
            if (l != this.highResLayer) {
                l.alpha = 0.0;
            }
        }
        */
        this.checkHighResTimeout = null;
    }
    else {
        // Check again later.
        this.checkHighResTimeout = setTimeout(this.checkHighRes, 5);
    }
};

App.prototype.startAnimating = function() {
    if (!this.animating) {
        this.animating = true;
        this.removeHighRes();
        this.updateImages();
    }
};

App.prototype.stopAnimating = function() {
    if (this.animating) {
        this.animating = false;
        this.removeHighRes();
        this.updateImages();
    }
};

App.prototype.updateImages = function() {
    var t = this.clock.time;
    var i = 0;

    // Find the layer that should be visible
    var section = this.timeline.sections[this.timeline.currentSection];
    
    var prevActiveLayer = this.activeLayer;
 
    // Figure out the active image.
    for (i = section.images.length - 1; i >= 0; i--) {
        var image = section.images[i];
        if (image.offset <= t) {
            this.activeLayer = image.layer;
            this.activeLayer.alpha = 1.0;
            break;
        }
    }

    var activeLayerChanged = prevActiveLayer != this.activeLayer;
   
    // Remove any existing high res layer if the layer has changed.
    if (activeLayerChanged) {
        this.removeHighRes();
    }

    // Now loop over all of the layers in the map and hide the other layers
    for (i = 0; i < this.viewer.scene.imageryLayers.length; i++) {
        var l = this.viewer.scene.imageryLayers.get(i);
        if (l != this.activeLayer && l != this.highResLayer) {
            l.alpha = 0.0;
        }
    }

    // Load the high res layer if necessary.
    if (!this.animating && (activeLayerChanged || !this.highResLayer)) {
        this.removeHighRes();
        if (this.loadHighResTimeout) {
            clearTimeout( this.loadHighResTimeout );
            this.loadHighResTimeout = null;
        }
        var that = this;
        this.loadHighResTimeout = setTimeout(function() {
            //console.log("Loading high res");
            that.loadHighRes();
        }, 500);
        //this.loadHighRes();
    }
};

// Shows an event
App.prototype.showEvent = function(event) {
    // Show the overlay
    if (event.href && event.href.length > 0) {
        this.showOverlay(event.href);
    }
    // Zoom the camera to the event.
    if (!isNaN(event.lon) && !isNaN(event.lat)) {
        var ellipsoid = this.viewer.scene.globe.ellipsoid;
        var cameraHeight = ellipsoid.cartesianToCartographic(this.viewer.camera.position).height;

        // Cancel any existing flyTo
        if (this.flyTo) {
            this.flyTo.cancel();
            this.flyTo = null;
        }
        var duration = 1.0;
        var flyTo = new FlyTo(this.viewer, new Cesium.Cartographic(Cesium.Math.toRadians(event.lon), Cesium.Math.toRadians(event.lat), cameraHeight), duration);
        this.flyTo = flyTo;
    }
};

// Shows an overlay
App.prototype.showOverlay = function(href, width, dismissProp) {
    this.hideChart();
    // reset overlay dimensions for proper sizing
    $("#info_overlay").height(1).css("width", "40%").removeClass("fullscreen").removeClass("fixedsize").removeClass("dismissible");
    $("#info_overlay_content").height(1);
    
    if (width) {
        $("#info_overlay").addClass("fixedsize");
        $("#info_overlay").css("width", width);
    }

    if (dismissProp) {
        $("#info_overlay").addClass("dismissible");
        $("#info_overlay").data("dismissProp", dismissProp);
    }

    $("#info_overlay_content").attr("src", href);
    $("#info_overlay").show();
    this.overlayVisible = true;
};

// Hides the overlay
App.prototype.hideOverlay = function() {
    $("#info_overlay").hide();

    $("#info_overlay_content").attr("src", "");

    this.overlayVisible = false;
};

App.prototype.dismissOverlay = function() {
    // save the setting
    var hide = $("#hide_check").is(":checked");
    var dismissProp = $("#info_overlay").data("dismissProp");
    if (dismissProp) {
        this.storeValue(dismissProp, hide);
    }

    // hide the overlay
    this.hideOverlay();
};

// formatOverlay is called by the iframe's on load handler (see main.js)
App.prototype.formatOverlay = function() {
    var $overlay = $("#info_overlay");
    var $overlayContent = $("#info_overlay_content");
    var dismissHeight = $("#info_overlay_dismiss_wrapper").is(":visible") ? $("#info_overlay_dismiss_wrapper").outerHeight() : 0.0;

    console.log("dismissHeight == " + dismissHeight);

    // adjust overlay height
    var contentHeight = $overlayContent.contents().find('body').prop("scrollHeight");
    var maxHeight = $(window).height() * 0.6; // NOTE: could maybe calc a better height based on header/footer/hud heights and window height???

    $overlayContent.height(contentHeight);

    if (contentHeight + dismissHeight < maxHeight || $overlay.hasClass("fixedsize")) {
        // content is small so set overlay height to match
        $overlay.height(contentHeight + dismissHeight);
    } else {
        // content taller than small overlay so toggle fullscreen class and set height
        // the smaller of the content height in fullscreen mode or half the window height
        $overlay.addClass("fullscreen");
        $overlay.css("width", "auto");
        contentHeight = $overlayContent.contents().find('body').prop("scrollHeight");
        $overlay.height(Math.min(contentHeight, maxHeight) + dismissHeight);
    }
    // add blank target to links within the overlay to launch them externally
    //$overlayContent.contents().find('a').attr("target", "_blank");
    //$overlayContent.contents().find('a').attr("onclick", "window.open(this.href,'_system'); return false;");
    $overlayContent.contents().find('a').click(function() {
        window.open(this.href,'_system');
        return false;
    });
};
App.prototype.showChart = function() {
            this.hideOverlay();
            $("#main_chart1").show();
            $("#main_chart_wrapper").addClass("onechart");
            this.chartVisible = true;
            $(window).resize();
};
App.prototype.hideChart = function() {
    $("#main_chart1").hide();
    $("#main_chart_wrapper").removeClass("onechart");
    $(".appmenu-menuitem.toggle.chart").removeClass("enabled"); // need to uncheck all chart menu items
    this.chartVisible = false;
};
App.prototype.showGraticule = function() {
    var len = this.graticule.length;
    for (var i = 0; i < len; ++i) {
    var p = this.graticule.get(i);
        p.show = true;
    }
};
App.prototype.hideGraticule = function() {
    var len = this.graticule.length;
    for (var i = 0; i < len; ++i) {
    var p = this.graticule.get(i);
        p.show = false;
    }
};

App.prototype.createGraticule = function() {
    // Create a simple graticule
    this.graticule = this.viewer.scene.primitives.add(new Cesium.PolylineCollection());
    var i = 0;
    var j = 0;
    var spacing = 10.0;
    var samples = 30.0;
    var numLatLines = 180.0/spacing;
    var numLonLines = 360.0/spacing;
    
    var latSpacing = 180.0/samples;
    var lonSpacing = 360.0/samples;

    var lon = 0;
    var lat = 0;
    var positions = null;

    var width = 2.0;

    var gridMaterial = Cesium.Material.fromType('Color');
    gridMaterial.uniforms.color = new Cesium.Color(0.6, 0.6, 0.6, 1.0);
    // Latitude lines
    for (i = 0; i <= numLatLines; i++)
    {
        lat = -90.0 + i * spacing;
        if (lat != -90.0 && lat != 90.0)
        {
            positions = [];
            for (j = 0; j <= samples; j++)
            {
                positions.push(-180.0 + j * lonSpacing, lat);
            }
            this.graticule.add({
                positions: Cesium.Cartesian3.fromDegreesArray(positions),
                material: gridMaterial,
                width: 1.0
            });
        }
    }

    // Longitude lines
    for (i = 0; i <= numLonLines; i++)
    {
        lon = -180.0 + i * spacing;
        if (lon != 180.0)
        {
            positions = [];
            for (j = 0; j <= samples; j++)
            {
                positions.push(lon, -90.0 + j * latSpacing);
            }
            this.graticule.add({
                positions: Cesium.Cartesian3.fromDegreesArray(positions),
                material: gridMaterial,
                width: 2.0
            });
        }
    }
};

App.prototype.hideCoastLines = function() {
    var len = this.coastlines.length;
    for (var i = 0; i < len; ++i) {
        var p = this.coastlines.get(i);
        p.show = false;
    }
};
App.prototype.showCoastLines = function() {
    var len = this.coastlines.length;
    for (var i = 0; i < len; ++i) {
        var p = this.coastlines.get(i);
        p.show = true;
    }
};
App.prototype.resetMap = function() {
    this.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0.0, 0.0, 15000000.0),
        orientation: { heading: 0.0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0.0 }
    });
};

App.prototype.zoomIn = function(rate) {
    var min = this.viewer.scene.screenSpaceCameraController.minimumZoomDistance;
    var max = this.viewer.scene.screenSpaceCameraController.maximumZoomDistance;
    var height = this.viewer.camera.positionCartographic.height;
    var distance = height - min;
    if (distance > 1000000.0) {
        var move = rate * distance;
        //if (height - move >= min) {
            this.viewer.camera.zoomIn(move);
        //}
    }
};

App.prototype.zoomOut = function(rate) {
    var min = this.viewer.scene.screenSpaceCameraController.minimumZoomDistance;
    var max = this.viewer.scene.screenSpaceCameraController.maximumZoomDistance;
    var height = this.viewer.camera.positionCartographic.height;
    var distance = max - height;
    var move = height - min;
    if (distance > 1000000.0 && height + move < max) {
        this.viewer.camera.zoomOut(move);
    }
};

App.prototype.storeValue = function(key, value)
{
    //if (chrome && chrome.app) {
    //    //TODO: chrome.storage.local is asynchronous so need to address this.
    //}
    //else if (window.localStorage) {
        window.localStorage.setItem(key, value);
    //}
};

App.prototype.retrieveValue = function(key)
{
    var val = null;
    //if (chrome && chrome.app) {
        //TODO: chrome.storage.local is asynchronous so need to address this.
    //}
    //else if (window.localStorage) {
        val = window.localStorage.getItem(key);
    //}
    
    return val;
};

module.exports = new App();
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./FlyTo.js":2,"./TagFilter.js":3,"./clock.js":7,"./timeline.js":13,"events":17,"underscore":22,"util":21}],5:[function(require,module,exports){
var app = require("./app.js");
var _ = require("underscore");
var utils = require("./utils.js");
var Chart = require("./chart.js");

function AppMenu(container) {
	this.$container = $("#" + container);

    this.chart1 = new Chart("main_chart1");

    _.bindAll(this, "loadMenus", "loadSection", "onResize");

    app.timeline.on("loaded", this.loadMenus);
    app.timeline.on("sectionChanged", this.loadSection);
    $(window).on('resize', this.onResize);
}

AppMenu.prototype.loadMenus = function() {
	var toggleRegex = new RegExp("(^|,)\s*toggle\s*($|,)", "i");

	for (var i=0; i < app.timeline.menus.length; i++) {
		var menu = app.timeline.menus[i];
		var $menuElement = $("<div class=\"appmenu\">" + menu.title + (menu.icon ? " <img src=\"" + menu.icon + "\"/>" : "") + "</div>");
		this.$container.append($menuElement);

		var $menuPopup = $("<div class=\"appmenu-popup " + menu.name + "\"></div>");
		for (var j=0; j < menu.menuitems.length; j++) {
			var menuitem = menu.menuitems[j];

			var toggleItem = toggleRegex.test(menuitem.tags);
			var tags = menuitem.tags ? menuitem.tags.replace(new RegExp(" ", "g"), "").replace(new RegExp(",", "g"), " ") : ""; // make class strings from tags

			var $menuitemElement = $("<div class=\"appmenu-menuitem " + tags + (menuitem.url ? " overlay-link\" data-href=\"" + menuitem.url + (menuitem.width ? "\" data-width=\"" + menuitem.width + "\"" : "") : "") + "\" data-name=\"" + menuitem.name + "\">" + menuitem.title + (toggleItem ? "<div class=\"appmenu-check\"></div>" : "") + "</div>");
			$menuPopup.append($menuitemElement);

			if (menuitem.textcolor) {
				$menuitemElement.css("color", menuitem.textcolor);
			}
		}
		this.$container.append($menuPopup);

		//position the menu popup then hide it
		var center = $menuElement.position().left + 36 + $menuElement.outerWidth() / 2.0;
		$menuPopup.css("left", center - $menuPopup.outerWidth() / 2.0);
		$menuPopup.hide();
	}

	//hookup click events to show menus
	var thisTS = this;
    this.$container.find('.appmenu').click(function() {
        //Expand or collapse this panel
        $(this).next().slideToggle('fast');

        //Hide the other panels
        $(".appmenu-popup", thisTS.$container).not($(this).next()).hide();
    });

    // non-toggle menu items should close the menu when clicked
    $(".appmenu-menuitem:not(.toggle)", this.$container).click(function() {
    	thisTS.closeAll();
    });

    // wire up layer toggle menu items
    $(".appmenu-menuitem.toggle.layer", this.$container).click(function() {
        if ($(this).hasClass("inactive")) {
            return;
        }

        var layerName = $(this).data("name").replace("layer-", "");
        var layerNameLC = layerName.toLowerCase();

       	if ($(this).hasClass("enabled")) {
            if (layerNameLC === "grid") {
                app.hideGraticule();
            }
            else if (layerNameLC === "coastlines") {
                app.hideCoastLines();
            }
            else {
       		    app.eventFilter.removeTag(layerName);
            }
       	}
       	else {
            if (layerNameLC === "grid") {
                app.showGraticule();
            }
            else if (layerNameLC === "coastlines") {
                app.showCoastLines();
            }
            else {
       		      app.eventFilter.addTag(layerName);
            }
       	}

       	$(this).toggleClass("enabled");
    });

    this.loadSection(app.timeline.sections[app.timeline.currentSection]);
};

AppMenu.prototype.onResize = function() {
    // reposition popup menus
    $('.appmenu-popup', this.$container).each(function() {
        var $menuElement = $(this).prev();

        var hidden = $(this).is(':hidden');
        $(this).show();

        var center = $menuElement.position().left + 36 + $menuElement.outerWidth() / 2.0;
        $(this).css("left", center - $(this).outerWidth() / 2.0);

        if (hidden) {
            $(this).hide();
        }
    });
};

AppMenu.prototype.loadSection = function(section) {
    // toggle all menus off then toggle on if an event of it's type is
    // found while iterating through.
    $(".appmenu-menuitem[data-name^='layer-']", this.$container).not("[data-name='layer-grid']").not("[data-name='layer-coastlines']").addClass("inactive");

    $.each(section.events, function(index, eventObj) {
        var tags = eventObj.tags ? eventObj.tags.replace(new RegExp(" ", "g"), "") : "";
        $.each(tags.split(','), function(tag_index, tag) {
            $(".appmenu-menuitem[data-name='layer-" + tag + "']", this.$container).removeClass("inactive");
        });
    });

    // clear the charts menu popup and add the charts for this section
    app.hideChart();

    var $chartPopup = $(".appmenu-popup.charts", this.$container);
    $chartPopup.empty();

    var datasources = _.filter(section.datasources, function(ds) {
        return utils.hasTag(ds, "chart");
    });

    _.each(datasources, function(d) {
        var $menuitemElement = $("<div class=\"appmenu-menuitem toggle chart\" data-datasource-id=\"" + d.id + "\">" + d.longname + "<div class=\"appmenu-check\"></div>" + "</div>");
            $chartPopup.append($menuitemElement);
    });

    // wire up chart toggle menu items
    var thisTS = this;
    $(".appmenu-menuitem.toggle.chart", this.$container).click(function() {
        var enabled = $(this).hasClass("enabled");

        if (enabled) {
            $(this).removeClass("enabled");
            app.hideChart();
        }
        else {
            $(".appmenu-menuitem.toggle.chart", thisTS.$container).removeClass("enabled");
            $(this).addClass("enabled");
            var dataId =  $(this).data("datasource-id");
            thisTS.chart1.selectChart(dataId);
            app.showChart();
        }

        thisTS.closeAll();
    });
};

AppMenu.prototype.closeAll = function() {
    $(".appmenu-popup", this.$container).hide();
};

module.exports = AppMenu;
},{"./app.js":4,"./chart.js":6,"./utils.js":15,"underscore":22}],6:[function(require,module,exports){
var app = require("./app.js");
var _ = require("underscore");
var utils = require("./utils.js");

// Extentd HighCharts so that the tooltip never hides
(function(H) {
    H.wrap(H.Tooltip.prototype, 'hide', function( defaultCallback) {
      // Do nothing.
    });
}(Highcharts));

function Chart(container) {
    this.$container = $("#" + container);

    this.init();

    _.bindAll(this, "selectChart", "updateTooltip");
    app.clock.on("timeChanged", this.updateTooltip);
}

Chart.prototype.init = function() {
    this.$chart = $("<div class=\"chart-body\"></div>");
    this.$container.append(this.$chart);

    var $closeButton = $("<img id=\"chart-close-button\" src=\"Resources/ui.bundle/close.png\"/>");
    $closeButton.click(function(e) {
        app.hideChart();
    });
    this.$container.append($closeButton);
};

Chart.prototype.updateTooltip = function() {
    var t = app.clock.time;
    if (this.chart) {
        // Find the index of the point that is the closest to the current time and refresh the tooltip
        var min = this.chart.series[0].points[0];
        var max = this.chart.series[0].points[this.chart.series[0].points.length-1];
        var p = null;
        if (t <= min.x) {
            p = min;
        }
        else if (t >= max.x) {
            p = max;
        }
        else {
            for (var i = 0; i < this.chart.series[0].points.length-1; i++) {
                var p0 = this.chart.series[0].points[i];
                var p1 = this.chart.series[0].points[i+1];
                if (p0.x <= t && p1.x >= t) {
                    p = p0;
                }
            }
        }
        this.chart.tooltip.refresh(p);
        this.chart.xAxis[0].removePlotLine("highlight");
        this.chart.xAxis[0].addPlotLine({
          id: "highlight",
          value: p.x,
          width: 1,
          color: '#fff'
        });
    }
};

Chart.prototype.selectChart = function(id) {
    // Get the current section
    var section = app.timeline.sections[app.timeline.currentSection];

    // Find the datasource with that id
    var ds = _.find(section.datasources, function(ds) {
        return ds.id === id;
    });

    this.ds = ds;

    var that = this;

    var xReversed = ds.xdirection == "descending";
    var yReversed = ds.ydirection == "descending";

    // Destroy the previous chart.
    if (that.chart) {
        that.chart.destroy();
    }

    var yRotation = 0;
    if (ds.ylabel.length >= 3 ) {
        yRotation = 270;
    }

    var ticks = [ds.min, ds.max];

    that.chart = new Highcharts.Chart({
        title: {
            text: ds.longname,
            style: {
                color: "#ffffff",
                fontSize: "24px"
            }
        },
        subtitle: {
            text: ds.description,
            style: {
                color: "#dddddd",
                fontSize: "16px"
            }
        },
        tooltip: {
            //crosshairs: [true, false],
            animation: false,
            formatter: function() {
                return "<b>" + this.y.toFixed(ds.yprecision) + "</b>";
            },
            
            positioner: function(labelWidth, labelHeight, point) {
                return {x: point.plotX + this.chart.plotLeft - labelWidth/2.0, y: point.plotY + this.chart.plotTop - labelHeight/2.0};
            },
            backgroundColor: null,
            borderColor: null,
            shadow: false,
            style: {
                color: "#fff"
            },
            shape: "square",
            useHTML: true,
            borderWidth: 0,
            borderRadius: 0
        },
        labels: {
            style: {
                color: "#ffffff"
            }
        },
        xAxis: {
            reversed: xReversed,
            labels: {
                style: {
                    color: "#ffffff"
                }
            },
            title: {
                text: ds.xlabel,
                style: {
                    color: "#ffffff"
                }
            },
            min: section.axis.start,
            max: section.axis.end
        },
        yAxis: {
            reversed: yReversed,
            labels: {
                style: {
                    color: "#ffffff"
                }
            },
            title: {
                text: ds.ylabel,
                rotation: yRotation,
                style: {
                    color: "#ffffff"
                }
            },
            min: ds.min,
            max: ds.max,

            // Keep the max from going too high.
            minPadding: 0.0,
            maxPadding: 0.0
            
            /*
            startOnTick: false,
            tickPositions: [ds.min, ds.max]  
            */     
        },
        legend: {
            enabled: false
        },
        series: [{
            animation: false,
            name: ds.longname,
            data: ds.data,
            // Disable the tooltip on mouse over.  We will track it based on the current time.
            enableMouseTracking: false 
        }],
        chart: {
            backgroundColor: null,
            renderTo: that.$chart[0]
        },
        plotOptions: {
            line: {
                marker: {
                    enabled: false
                }
            }
        },
        credits: false
    });

    this.updateTooltip();
};

module.exports = Chart;
},{"./app.js":4,"./utils.js":15,"underscore":22}],7:[function(require,module,exports){
var EventEmitter = require("events").EventEmitter;
var util = require("util");
var _ = require("underscore");

function Clock() {
    this.minTime = 0.0;
    this.maxTime = 550.0;
    this.time = 0.0;
    this.direction = 1;

    // Duration in seconds.
    this.animationDuration = 30.0;

    // Refresh frequence in ms
    this.tickFreq = 100;

    this.state = "paused";

    _.bindAll(this, "tick");
}

util.inherits(Clock, EventEmitter);

Clock.prototype.setTime = function(time) {
    if (this.time != time) {
        this.time = time;
        if (this.time < this.minTime) this.time = this.minTime;
        if (this.time > this.maxTime) this.time = this.maxTime;
        this.emit("timeChanged", this.time);
    }
};

Clock.prototype.isPlaying = function() {
    return this.state == "playing";
};

Clock.prototype.isPaused = function() {
    return this.state == "paused";
};

Clock.prototype.play = function(direction) {
    if (this.isPlaying() && this.direction === direction ) {
        return;
    }

    if (this.timeout) {
        clearTimeout(this.timeout);
    }

    this.direction = direction;
    this.state = "playing";
    this.emit("stateChanged");
    this.timeout = setTimeout(this.tick, this.tickFreq);
};

Clock.prototype.pause = function() {
	if (!this.isPaused()) {
        clearTimeout(this.timeout);
        this.state = "paused";
        this.emit("stateChanged");
    }
};

Clock.prototype.getDuration = function() {
    return this.maxTime - this.minTime;
};

Clock.prototype.tick = function() {
    // Determine the increment in clock units based on the duration
    var totalTime = this.maxTime - this.minTime;
    var incPerMS = totalTime / (this.animationDuration * 1000.0);
    var incPerTick = incPerMS * this.tickFreq;

    var inc = this.direction == 1 ? incPerTick : -incPerTick;
    this.setTime(this.time + inc);

    // See if we've finished the animation
    if ((this.direction == -1 && this.time == this.minTime) ||
       (this.direction == 1  && this.time == this.maxTime)) {
       	this.pause();
    }
    else {
        this.timeout = setTimeout(this.tick, this.tickFreq);
    }
};

module.exports = Clock;
},{"events":17,"underscore":22,"util":21}],8:[function(require,module,exports){
var app = require("./app.js");

function Compass(id) {
	this.id = id;
	this.heading = null;
	var that = this;

	var $elem = $("#" + this.id);

    var $compass = $("<div>").appendTo($elem);

	$compass.addClass("compass");
	$compass.append('<div class="compass-label compass-N">N</div>');
	$compass.append('<div class="compass-label compass-S">S</div>');
	$compass.append('<div class="compass-label compass-E">E</div>');
	$compass.append('<div class="compass-label compass-W">W</div>');

    app.viewer.scene._postRender.addEventListener(function(scene, time) {
        var heading = app.viewer.camera.heading;
        if (this.heading != heading) {
        	this.heading = heading;
        	// Rotate the whole compass by the negative heading
        	$compass.css({ transform: 'rotate(' + -heading + 'rad)'});

        	// Rotate each of the individual labels by the opposite amount to keep them facing straight up and down.
        	$(".compass-N", $compass).css({ transform: 'rotate(' + heading + 'rad)'});
        	$(".compass-E", $compass).css({ transform: 'rotate(' + heading + 'rad)'});
        	$(".compass-S", $compass).css({ transform: 'rotate(' + heading + 'rad)'});
        	$(".compass-W", $compass).css({ transform: 'rotate(' + heading + 'rad)'});
        }
    });

    $compass.click(function() {
        app.resetMap();
    });

    var $zoomControls = $("<div>").appendTo($elem).addClass("compass-zoom-controls");
    var $zoomIn = $('<div class="compass-zoomin compass-zoom-control"></div>').appendTo($zoomControls);
    var rate = 0.5;
    $zoomIn.click(function(e) {
        app.zoomIn(rate);
    });

    var $zoomout = $('<div class="compass-zoomout compass-zoom-control"></div>').appendTo($zoomControls);
    $zoomout.click(function(e) {
        app.zoomOut(rate);
    });
}

module.exports = Compass;
},{"./app.js":4}],9:[function(require,module,exports){
var app = require("./app.js");
var Compass = require("./compass.js");
var _ = require("underscore");

function DataHud(container) {
	this.$container = $("#" + container);

	this.dataSources = undefined;
	this.yearStep = 1;

	this.init();

    _.bindAll(this, "loadSection", "onTimeChanged");

    app.timeline.on("sectionChanged", this.loadSection);
    app.clock.on("timeChanged", this.onTimeChanged);
}

DataHud.prototype.init = function() {
	this.$container.addClass("datahud");

	this.$hudLeft = $("<div class=\"hud-left\"><div class=\"hud-left-yearwrap\"></div><div class=\"hud-left-data headsup-left\"><div><span class=\"overlay-link\" data-href=\"Resources/web.bundle/hud/atmosphere.html\">ATMOSPHERE</span></div></div></div>");
	this.$container.append(this.$hudLeft);

	//TIME field is special case, go ahead and set up
	var $timeField = this.createDataField("years", "TIME =", "");
	$(".hud-left-yearwrap", this.$hudLeft).append($timeField);

	this.$hudRight = $("<div class=\"hud-right\"><div class=\"hud-right-data headsup-right\"></div><div class=\"hud-right-compasswrap\"><div id=\"hud_compass\"></div></div></div>");
	this.$container.append(this.$hudRight);

	this.compass = new Compass("hud_compass");
};

DataHud.prototype.createDataField = function(id, name, unit, href) {
	$dataField = $("<div id=\"hud_data_" + id + "\" class=\"hud-data\"><div class=\"hud-data-name\">" + (href ? "<span class=\"overlay-link\" data-href=\"" + href + "\">" : "") + name + (href ? "</span>" : "") + "</div><div class=\"hud-data-value\"></div><div class=\"hud-data-unit\">" + unit + "</div></div>");
	return $dataField;
};

DataHud.prototype.loadSection = function(section) {
    // remove existing data fields (except the year field)
    $(".hud-data", this.$container).not("#hud_data_years").remove();

    // calculate the step size for year values
    var range = section.axis.end - section.axis.start;
    this.yearStep = range <= 100 ? 2 : range <= 1000 ? 5 : range <= 10000 ? 10 : 100; //better way? in the timeline somewhere?
	
    // find data sources with "headsup-xxx" tags
    this.findDataSources(section.datasources);

    if (this.dataSources) {
       	for (var i=0; i < this.dataSources.length; i++) {
       		var ds = this.dataSources[i];

       		if (ds.tags.match("headsup-left")) {
       			var $leftField = this.createDataField(ds.id, ds.shortname, ds.ylabel, ds.href);
                $(".headsup-left", this.$container).append($leftField);
       		} else if (ds.tags.match("headsup-right")) {
                var $rightField = this.createDataField(ds.id, ds.shortname, ds.ylabel, ds.href);
                $(".headsup-right", this.$container).append($rightField);
       		}
       	}
    }

    // set time to 0 or the axis' start value if 0 is not within the range
    var startTime = 0.0;
    if (section.axis.start > 0.0 || section.axis.end < 0.0) {
        startTime = section.axis.start;
    }
    this.onTimeChanged(startTime);  // Need to call manually on section load
};

DataHud.prototype.findDataSources = function(sources) {
    var sourceRegex = new RegExp("(^|,)\s*headsup-[a-zA-Z]*\s*($|,)", "i");
    this.dataSources = $.grep(sources, function(s) {
        return sourceRegex.test(s.tags);
    });
};

DataHud.prototype.onTimeChanged = function(time) {
	if (this.dataSources) {
       	for (var i=0; i < this.dataSources.length; i++) {
       		var ds = this.dataSources[i];
       		var value = ds.getValue(time);
          var label = "";

       		if (ds.tags.match("headsup-year")) {
       			// this is for Paleo and Early Earth sections
       			// there may be a more accurate way?
       			if (value === 0) {
       				value = time;
       			}

                // round to nearest time incremnt step
                // abs() to prevent negative values for future dates (see sea level data)
                value = Math.abs(Math.round(value / this.yearStep) * this.yearStep);

                // again this is for Paleo and Early Earth sections
       			if (ds.xlabel === "MYA") {
       			    label = "MYA";
       		    }
       		}
       		
          var text = "";
          if (isNaN(value)) {
              // handle invalid values
              text = value ? value : "NO DATA";
          }
          else {
              text = value.toFixed( ds.yprecision ) + " " + label;
          }

       		// update data field
	        $("#hud_data_" + ds.id + " .hud-data-value", this.$container).html(text);
       	}
    }
};

module.exports = DataHud;
},{"./app.js":4,"./compass.js":8,"underscore":22}],10:[function(require,module,exports){
var template = require("./templates/test.tpl");
var $ = window.$;
var chart = require("./chart.js");
var app = require("./app.js");
var TimeSlider = require("./timeslider.js");
var EventIcons = require("./EventIcons.js");
var VCR = require("./vcr.js");
var AppMenu = require("./appmenu.js");
var DataHud = require("./datahud.js");
var PaletteRenderer = require("./paletterenderer.js");

// DEBUG
//app.clock.on("timeChanged", function(time) {
//    $('#testOut').html(time);
//});

$(function() {


    // Initialize the map
    app.initMap();

    var timeslider = new TimeSlider("main_sidebarleft", "main_titleblock");
    var appMenu = new AppMenu("footer_menubox");
    var dataHud = new DataHud("main_hud");
    var palette = new PaletteRenderer("main_legend");

    var eventIcons = new EventIcons();
    var vcr = new VCR();

    app.timeline.load({url: "Resources/metadata.bundle/timeline.xml"});

    $("#main_BILogo").click(function(e) {
        window.open("http://www.hhmi.org/biointeractive");
    });

    $("#info_overlay_close").click(function(e) {
        app.hideOverlay();
    });

    $("#info_overlay_dismiss_button").click(function(e) {
        app.dismissOverlay();
    });
    

    // If you click on an overlay link display the overlay.
    $("body").on("click", ".overlay-link", function(e) {
        var href = $(this).data("href");
        var width = $(this).data("width");
        if (href) {
            app.showOverlay(href, width);
        }
    });

    // process overlay content
    $("#info_overlay_content").on("load", function() {
        app.formatOverlay();
    });

    // If you hit play then 
    $(document).keydown(function(event) {
        var arrowRatio = 0.02;
        // Space bar
        if (event.keyCode == 32) {
            if (app.clock.isPlaying()) {
                app.clock.pause();
            }
            else {
                // If we are at the beginning of time, play forward.
                if (app.clock.time === app.clock.minTime) {
                    app.clock.play(1);
                }
                // If we we are at the end of time, play backwards.
                else if (app.clock.time === app.clock.maxTime) {
                    app.clock.play(-1);
                }
                // If we have a direction, keep playing in that direction.
                else if (app.clock.direction !== 0 ) {
                    // Play in the direction it was previously playing.
                    app.clock.play(app.clock.direction);
                }
                // Just play it forward.
                else {
                    app.clock.play(1);
                }
            }
        }
        // Right arrow
        else if (event.keyCode == 39) {
            app.clock.setTime(app.clock.time + arrowRatio * app.clock.getDuration());
        }
        // Left arrow.
        else if (event.keyCode == 37) {
            app.clock.setTime(app.clock.time - arrowRatio * app.clock.getDuration());
        }
    });

    // Disable touchmove
    $(document).bind('touchmove', false);

    var tutorialHidden = app.retrieveValue("tutorial_hidden");
    if (tutorialHidden !== true && tutorialHidden !== "true") {

        //TODO: temporary until chrome storage approach is implemented
        //if (chrome) {
            //app.showOverlay("Resources/web.bundle/info/earthviewer-tutorial-startup.html", "60%");
        //}
        //else {
            app.showOverlay("Resources/web.bundle/info/earthviewer-tutorial-startup.html", "60%", "tutorial_hidden");
        //}
    }
});
},{"./EventIcons.js":1,"./app.js":4,"./appmenu.js":5,"./chart.js":6,"./datahud.js":9,"./paletterenderer.js":11,"./templates/test.tpl":12,"./timeslider.js":14,"./vcr.js":16}],11:[function(require,module,exports){
var app = require("./app.js");
var _ = require("underscore");

function PaletteRenderer(container, paletteHeight) {
	this.$container = $("#" + container);
	this.paletteHeight = paletteHeight ? paletteHeight : 200;

    _.bindAll(this, "loadSection");

    app.timeline.on("sectionChanged", this.loadSection);
}

PaletteRenderer.prototype.drawPalette = function(palette) {
    var $paletteBox = $("<div class=\"palette-box\"></div>");
	this.$container.append($paletteBox);

	var $paletteWrap = $("<div class=\"palette-wrap\"></div>");
	$paletteBox.append($paletteWrap);

	var range = palette.rangeMax - palette.rangeMin;

	var levels = [];

    var gradientStr = "linear-gradient(to top, ";
    for (var i=0; i < palette.intervals.length; i++) {
       	var interval = palette.intervals[i];

       	var lowerStart = Math.round((interval.lower.level - palette.rangeMin) / range * 100.0);
	    gradientStr += (i === 0 ? "" : ",") + "rgba(" +
	       	interval.lower.red + "," +
	       	interval.lower.green + "," +
	       	interval.lower.blue + "," +
	       	(interval.lower.alpha / 255.0) + ") " + lowerStart + "%";

        levels.push(interval.lower.level);

        var upperStart = Math.round((interval.upper.level - palette.rangeMin) / range * 100.0);
        gradientStr += ",rgba(" +
	       	interval.upper.red + "," +
	       	interval.upper.green + "," +
	       	interval.upper.blue + "," +
	       	(interval.upper.alpha / 255.0) + ") " + upperStart + "%";

        levels.push(interval.upper.level);
    }
    gradientStr += ");";
                    
	var $gradient = $("<div class=\"palette-gradient\" style=\"height: " + this.paletteHeight + "px; background: " + gradientStr + "\"></div>");
	$paletteWrap.append($gradient);

    // remove duplicate levels and add to display
    var uniqueLevels = [];
    $.each(levels, function(i, el) {
        if($.inArray(el, uniqueLevels) === -1) uniqueLevels.push(el);
    });

    var that = this;
    $.each(uniqueLevels, function(i, el) {
       	var pos = (el - palette.rangeMin) / range * that.paletteHeight;
       	$paletteWrap.append("<div class=\"palette-level\" style=\"bottom: " + pos + "px;\">" + el + "</div>");
    });


    //TODO: adjust $paletteBox's padding-right based on pallet-level text width


    // add description and units to display
    $paletteBox.append("<div class=\"palette-text\">" + (palette.description ? palette.description + "<br />" : "") + palette.units + "</div>");
};

PaletteRenderer.prototype.loadSection = function(section) {
	this.$container.empty();

	if (section.palettes) {
		for (var p=0; p < section.palettes.length; p++) {
			this.drawPalette(section.palettes[p]);
		}
	}
};

module.exports = PaletteRenderer;
},{"./app.js":4,"underscore":22}],12:[function(require,module,exports){
var _ = require('underscore');
module.exports = function(obj){
var __t,__p='',__j=Array.prototype.join,print=function(){__p+=__j.call(arguments,'');};
with(obj||{}){
__p+=''+
((__t=( name ))==null?'':__t)+
'';
}
return __p;
};

},{"underscore":22}],13:[function(require,module,exports){
var app = require("./app.js");
var EventEmitter = require("events").EventEmitter;
var util = require("util");

function Menu() {
    this.name = "";
    this.title = "";
    this.icon = "";
    this.tags = "";
    this.menuitems = [];
}

function Section() {
    // Init the defaults
    this.name = "";
    this.title = "";
    this.description = "";

    this.headings = [];

    this.axis = {
        start: 0.0,
        end: 100.0,
        labelstart: 0.0,
        labelend: 100.0,
        labelevery: 20.0,
        scale: 1.0,
        legend: "",
        switchnext: 500.0
    };

    this.palettes = [];

    this.ranges = [];

    this.datasources = [];

    this.images = [];

    this.events = [];
}

function DataSource(options) {
    this.id = options.id;
    this.shortname = options.shortname;
    this.longname = options.longname;
    this.src = options.src;
    this.xlabel = options.xlabel;
    this.ylabel = options.ylabel;
    this.xdirection = options.xdirection;
    this.ydirection = options.ydirection;
    this.xprecision = options.xprecision;
    this.yprecision = options.yprecision;
    this.description = options.description;
    this.tags = options.tags;
    this.href = options.href;
    this.loaded = false;
}

DataSource.prototype.getValue = function(time) {
    var min = this.data[0][0];
    var max = this.data[this.data.length - 1][0];

    if (time < min) {
        //return this.data[0][1];
        return NaN;
    }

    if (time > max) {
        //return this.data[this.data.length - 1][1];
        return NaN;
    }

    for (var i = 0; i < this.data.length - 1; i++) {
        var x0 = this.data[i][0];
        var y0 = this.data[i][1];
        var x1 = this.data[i + 1][0];
        var y1 = this.data[i + 1][1];

        if (x0 <= time && x1 >= time) {
            // Linear interpolate between the values.
            var t = (time - x0) / (x1 - x0);
            return y0 + t * (y1 - y0);
        }
    }

    return NaN;
};

DataSource.prototype.loadData = function() {
    var that = this;
    $.ajax({
        url: this.src,
        success: function(data) {
            var series = [];
            var lines = data.split("\n");
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var parts = line.split(",");
                if (parts.length >= 2) {
                    var d = [parseFloat(parts[0]), parseFloat(parts[1])];
                    series.push(d);
                }
            }
            // Now sort the data to make sure it's in ascending order
            series.sort(function(a, b) {
                return a[0] - b[0];
            });

            // Compute the minimum and maximum values for the datasource
            var min = Number.MAX_VALUE;
            var max = -Number.MAX_VALUE;
            for (var j = 0; j < series.length; j++) {
                var v = series[j][1];
                if (v < min) min = v;
                if (v > max) max = v;
            }
            that.min = min;
            that.max = max;
            that.data = series;
            that.loaded = true;
        }
    });
};

function Palette(options) {
    this.description = options.description;
    this.units = options.units;
    this.src = options.src;
    this.intervals = [];
    this.loaded = false;
    this.rangeMin = 0;
    this.rangeMax = 0;
}

// Currently only loading the first ColorPalette within a
// palette xml file. This could be expanded if needed.
Palette.prototype.load = function() {
    var that = this;
    $.ajax({
        url: this.src,
        dataType: "xml",
        success: function(xml) {
            var rangeMin;
            var rangeMax;

            $(xml).find('ColorPalette').first().each(function() {
                that.name = $(this).attr('name');

                if (!that.units) {
                    that.units = $(this).attr('units');
                }

                that.metric = $(this).attr('metric');

                $(xml).find('table').first().each(function() {
                    $(this).find('interval').each(function() {
                        var interval = {
                            id: $(this).attr('id'),
                            smooth: $(this).attr('smooth')
                        };

                        $(this).find('lower').first().each(function() {
                            var lower = {
                                level: parseFloat($(this).attr('level')),
                                hex: $(this).attr('hex'),
                                alpha: parseFloat($(this).attr('alpha')),
                                red: parseFloat($(this).attr('red')),
                                green: parseFloat($(this).attr('green')),
                                blue: parseFloat($(this).attr('blue'))
                            };

                            interval.lower = lower;

                            if (rangeMin === undefined || lower.level < rangeMin) {
                                rangeMin = lower.level;
                            }
                        });

                        $(this).find('upper').first().each(function() {
                            var upper = {
                                level: parseFloat($(this).attr('level')),
                                hex: $(this).attr('hex'),
                                alpha: parseFloat($(this).attr('alpha')),
                                red: parseFloat($(this).attr('red')),
                                green: parseFloat($(this).attr('green')),
                                blue: parseFloat($(this).attr('blue'))
                            };

                            interval.upper = upper;

                            if (rangeMax === undefined || upper.level > rangeMax) {
                                rangeMax = upper.level;
                            }
                        });

                        that.intervals.push(interval);
                    });
                });
            });

            // set the range min and max for the palette
            that.rangeMin = rangeMin;
            that.rangeMax = rangeMax;

            // sort intervals in ascending order
            that.intervals.sort(function(a, b) {
                return a.lower.level - b.lower.level;
            });

            that.loaded = true;
        },
        error: function() {
            console.log("Error loading palette: " + that.src);
            that.loaded = true; // still set to true so app won't hang
        }
    });
};

function Timeline() {
    this.sections = [];
    this.currentSection = 0;
    this.menus = [];
}

util.inherits(Timeline, EventEmitter);

Timeline.prototype.loadMenu = function(node) {
    var menu = new Menu();
    menu.name = node.attr("name");
    menu.title = node.attr("title");
    menu.icon = node.attr("icon");
    menu.tags = node.attr("tags");

    node.children("menuitem").each(function() {
        var menuitem = {
            name: $(this).attr("name"),
            title: $(this).attr("title"),
            tags: $(this).attr("tags"),
            textcolor: $(this).attr("textcolor"),
            url: $(this).attr("url"),
            width: $(this).attr("width")
        };
        menu.menuitems.push(menuitem);
    });

    return menu;
};

Timeline.prototype.loadSection = function(node) {
    var section = new Section();
    section.name = node.attr("name");
    section.title = node.attr("title");
    section.description = node.attr("description");

    // Load the headings
    node.children("heading").each(function() {
        var heading = {
            left: parseFloat($(this).attr("left")),
            right: parseFloat($(this).attr("right")),
            name: $(this).attr("name")
        };
        section.headings.push(heading);
    });

    // Load the axis
    node.children("axis").first().each(function() {
        section.axis = {
            start: parseFloat($(this).attr("start")),
            end: parseFloat($(this).attr("end")),
            labelstart: parseFloat($(this).attr("labelstart")),
            labelend: parseFloat($(this).attr("labelend")),
            labelevery: parseFloat($(this).attr("labelevery")),
            scale: parseFloat($(this).attr("scale")),
            legend: $(this).attr("legend"),
            switchprev: parseFloat($(this).attr("switchprev")),
            switchnext: parseFloat($(this).attr("switchnext"))
        };
    });

    // Load the palette(s)
    node.children("palette").each(function() {
        var palette = new Palette({
            description: $(this).attr("description"),
            units: $(this).attr("units"),
            src: $(this).attr("src")
        });

        palette.load();
        section.palettes.push(palette);
    });

    // Load all the ranges
    node.children("range").each(function() {
        var range = {
            name: $(this).attr("name"),
            left: parseFloat($(this).attr("left")),
            right: parseFloat($(this).attr("right")),
            start: parseFloat($(this).attr("start")),
            end: parseFloat($(this).attr("end")),
            bgcolor: $(this).attr("bgcolor"),
            labelrotation: parseFloat($(this).attr("labelrotation")),
            href: $(this).attr("href")
        };
        section.ranges.push(range);
    });

    // Load all the data sources
    node.children("datasource").each(function() {
        var ds = new DataSource({
            id: $(this).attr("id"),
            shortname: $(this).attr("shortname"),
            longname: $(this).attr("longname"),
            src: $(this).attr("src"),
            xlabel: $(this).attr("xlabel"),
            ylabel: $(this).attr("ylabel"),
            xdirection: $(this).attr("xdirection"),
            ydirection: $(this).attr("ydirection"),
            xprecision: parseInt($(this).attr("xprecision")),
            yprecision: parseInt($(this).attr("yprecision")),
            tags: $(this).attr("tags"),
            description: $(this).attr("description"),
            href: $(this).attr("href")
        });
        section.datasources.push(ds);
    });

    // Load all the images
    node.children("image").each(function() {
        var image = {
            offset: parseFloat($(this).attr("offset")),
            src: $(this).attr("src")
        };
        section.images.push(image);
    });

    // Load all the events
    node.children("event").each(function() {
        var e = {
            offset: parseFloat($(this).attr("offset")),
            start: parseFloat($(this).attr("start")),
            end: parseFloat($(this).attr("end")),
            name: $(this).attr("name"),
            icon: $(this).attr("icon"),
            lat: parseFloat($(this).attr("lat")),
            lon: parseFloat($(this).attr("lon")),
            tags: $(this).attr("tags"),
            href: $(this).attr("href")
        };
        section.events.push(e);
    });

    // Sort the images by their offset
    section.images.sort(function(a, b) {
        return a.offset - b.offset;
    });

    return section;
};


// Loads all of the datasources.
Timeline.prototype.loadDatasources = function() {
    for (var i = 0; i < this.sections.length; i++) {
        var section = this.sections[i];
        for (var j = 0; j < section.datasources.length; j++) {
            var datasource = section.datasources[j];
            datasource.loadData();
        }
    }
};

Timeline.prototype.waitForDatasources = function(complete) {
    var loaded = true;
    for (var i = 0; i < this.sections.length; i++) {
        var section = this.sections[i];
        for (var j = 0; j < section.datasources.length; j++) {
            var datasource = section.datasources[j];
            if (!datasource.loaded) {
                loaded = false;
                break;
            }
        }
        for (var k = 0; k < section.palettes.length; k++) {
            var palette = section.palettes[k];
            if (!palette.loaded) {
                loaded = false;
                break;
            }
        }
        if (!loaded) {
            break;
        }
    }

    var that = this;
    
    if (!loaded) {
        setTimeout(function() {
            that.waitForDatasources(complete);
        }, 100);
    }
    else {
        // Fire the complete callback
        complete();
    }

};

Timeline.prototype.load = function(options) {
    var that = this;
    $.ajax({
        url: options.url,
        dataType: "xml",
        success: function(xml) {

            that.defaultsection = $(xml).children("timeline").first().attr("defaultsection");

            // Load the menus
            $(xml).find("menu").each(function() {
                var menu = that.loadMenu($(this));
                that.menus.push(menu);
            });

            // Load each section
            $(xml).find("section").each(function() {
                var section = that.loadSection($(this));
                that.sections.push(section);
            });

            // Load all the datasources.
            that.loadDatasources();
            // Wait for the datasources to load.
            that.waitForDatasources(function() {
                // Don't emit loaded until all of the datasources are done loading.
                that.emit("loaded");
            });
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.log(textStatus + " " + errorThrown.toString());
        }
    });
};

Timeline.prototype.setCurrentSection = function(sectionIndex) {
    if (this.currentSection != sectionIndex &&
        this.currentSection >= 0 &&
        this.currentSection < this.sections.length) {
        this.currentSection = sectionIndex;
        this.emit("sectionChanged", this.sections[this.currentSection]);
    }
};

module.exports = Timeline;
},{"./app.js":4,"events":17,"util":21}],14:[function(require,module,exports){
var app = require("./app.js");
var _ = require("underscore");

function TimeSlider(container, titleContainer) {
    this.rangeMin = 0.0;
    this.rangeMax = 0.0;
    this.scrubberStep = 1.0;
    this.scrubberOffset = 17; // half the scrubber image height (shouldn't change)

    this.timeline = undefined;
    this.timelineEvents = undefined;

    this.sectionId = -1;

    this.$container = $("#" + container);
    this.$titleContainer = titleContainer ? $("#" + titleContainer) : undefined;

    this.init();

    _.bindAll(this, "loadTimeline", "loadSection", "redrawSlider");

    app.timeline.on("loaded", this.loadTimeline);
    app.timeline.on("sectionChanged", this.loadSection);

    //When the filter changes, redraw the slider.
    app.eventFilter.on("filterChanged", this.redrawSlider);
}

TimeSlider.prototype.init = function() {
    this.$container.append("<div class=\"timeslider-header\"><div class=\"timeslider-legend\"></div></div>");
    this.$container.append("<div class=\"timeslider-content\"></div>");
    this.$container.append("<div class=\"timeslider-ruler\"><div class=\"timeslider-box dragdealer\"><div class=\"handle timeslider-scrubber\"></div></div></div>");
    $('body').append("<div class=\"timeslider-eventbox\"></div>");

    var thisTS = this;

    this.dragger = new Dragdealer($('.timeslider-box', this.$container).get(0), {
        horizontal: false,
        vertical: true,
        dragStartCallback: function(x,y) {
            //app.startAnimating();
        },
        dragStopCallback: function(x,y) {
            //app.stopAnimating();
        },
        animationCallback: function(x, y) {
            if (!thisTS.ignoreDrag) {
                var range = thisTS.rangeMax - thisTS.rangeMin;
                var time = range * y + thisTS.rangeMin;
                app.clock.setTime(time);
            }
        }
    });

    // listen for clock time changes
    app.clock.on("timeChanged", function(time) {
        thisTS.updateTime(time);
    });

    // listen for window resize events
    $(window).resize(function() {
        thisTS.redraw();
    });
};

TimeSlider.prototype.updateTime = function(time) {
    var range = this.rangeMax - this.rangeMin;

    //position slider scrubber
    var sliderTime = (time - this.rangeMin) / range;
    this.ignoreDrag = true;
    this.dragger.setValue(0.0, sliderTime, true);
    this.ignoreDrag = false;

    // update timeline events
    this.showTimelineEvents(time);

    // update title
    if (this.$titleContainer) {
        var titleString = "";
        if (this.sectionId >= 0) {
            if (this.timeline.sections[this.sectionId].title) {
                titleString = this.timeline.sections[this.sectionId].title;
            }
            else {
                var ranges = this.timeline.sections[this.sectionId].ranges;
                for (var i=0; i < ranges.length; i++) {
                    if (time >= ranges[i].start && (time < ranges[i].end || (time == ranges[i].end && time == this.rangeMax))) {
                        titleString += (titleString ? " | " : "") + ranges[i].name.toUpperCase();
                    }
                }
            }
        }

        this.$titleContainer.html(titleString);
    }
};

TimeSlider.prototype.redraw = function() {
    this.redrawContent();
    this.redrawSlider();
};

TimeSlider.prototype.redrawSlider = function() {
    var axis = this.timeline.sections[this.sectionId].axis;
    var $rulerbox = $('.timeslider-box', this.$container);

    //TODO: replace hardcoded '32' with actual size measurement to better handle css changes
    var topMargin = ((this.sectionId + 1) * 32) - this.scrubberOffset;
    var botMargin = this.timeline.sections.length * 32 - topMargin - (this.scrubberOffset * 2.0);
    $rulerbox.css("top", topMargin);
    $rulerbox.css("bottom", botMargin);

    $(".timeslider-rulemark", $rulerbox).remove();
    $(".timeslider-tickmark", $rulerbox).remove();

    var totH = $rulerbox.height() - this.scrubberOffset * 2;
    var range = axis.end - axis.start;
    if (range > 0) {

        // add numbers to ruler
        if (axis.labelevery > 0) {
            for (var i=axis.labelstart; i <= axis.labelend; i+=axis.labelevery) {
                var markTop = (i - axis.start) / range * totH + this.scrubberOffset;
                $rulerbox.append("<div class=\"timeslider-rulemark\" style=\"top:" + markTop + "px;\">" + Math.abs(i) + "</div>");
            }
        }

        // draw tick marks denoting imagery ranges
        var images = app.timeline.sections[app.timeline.currentSection].images;
        if (images) {
            for (var idx=0; idx < images.length; idx++) {
                var tickTop = ((images[idx].offset - axis.start) / range) * totH + this.scrubberOffset;
                $rulerbox.append("<div class=\"timeslider-tickmark\" style=\"top:" + tickTop + "px;\"></div>");
            }
        }
    }


    // remove old event markers and add new ones
    $(".timeslider-eventmarker", $rulerbox).remove();

    var $eventsBox = $(".timeslider-eventbox");
    $eventsBox.empty();

    if (this.timelineEvents) {
        // Filter the events
        var events = app.eventFilter.filter(this.timelineEvents);
        for (var j = 0; j < events.length; j++) {
            var currentEvent = events[j];
            var eventTop = (currentEvent.offset / range) * totH + this.scrubberOffset;
            var colorStr = currentEvent.tags.replace(/,/g, " ");

            var $eventElement = $("<div class=\"timeslider-eventmarker " + colorStr + "\" style=\"top:" + eventTop + "px\" data-name=\"" + currentEvent.name + "\" data-offset=\"" + currentEvent.offset + "\"></div>");
            $rulerbox.append($eventElement);

            var $eventPopup = $("<div class=\"timeslider-eventpopup " + colorStr +
                "\" data-name=\"" + currentEvent.name +
                "\" data-href=\"" + currentEvent.href +
                "\" data-offset=\"" + currentEvent.offset +
                "\">" + currentEvent.name + "</div>");
            // Attach the event object to the popup.
            $eventPopup.data("event", currentEvent);
            $eventsBox.append($eventPopup);
        }

        // If you click on a timeslider-eventpopup it will have an event associated with it so display it.
        $(".timeslider-eventpopup", $eventsBox).click(function() {
            var event = $(this).data("event");
            // This is a timeline event, so it's not going to have a lat/lon.  In this case let's zoom over all of the events and try to find one
            // that has the same name but has a lat/lon so we can zoom to it.
            if (isNaN(event.lon) || isNaN(event.lat)) {
                var section = app.timeline.sections[app.timeline.currentSection];
                for (var i = 0; i < section.events.length; i++) {
                    var e = section.events[i];
                    if (e.name == event.name && // Same name
                        !isNaN(e.lon) && !isNaN(e.lat) && // Has a valid location
                        !isNaN(e.start) && !isNaN(e.end) && // Has a time range
                        e.start <= event.offset && e.end >= event.offset) //It's the event that matches this timeline event's offset
                    {
                        event = e;
                        break;
                    }
                }
            }
        
            app.showEvent(event);
        });
    }

    this.dragger.reflow();
};

TimeSlider.prototype.redrawContent = function() {
    var $content = $('.timeslider-content', this.$container);

    var accordionH = 0;
    $('.accordion-toggle', $content).each(function() {
        accordionH += $(this).outerHeight();
    });

    var contentH = $content.height() - accordionH;
    var $contentPanels = $('.accordion-content', $content);

    $contentPanels.css("height", contentH);

    var contentW = $content.width();

    for (var i = 0; i < $contentPanels.length; i++) {
        var $panel = $($contentPanels[i]);
        var section = this.timeline.sections[i];
        var sectionRange = section.axis.end - section.axis.start;

        $panel.empty();

        for (var j = 0; j < section.ranges.length; j++) {
            var range = section.ranges[j];
            var $rangeDiv = $("<div class=\"timeslider-range\"></div>");
            $panel.append($rangeDiv);

            var rangeLeft = range.left * contentW;
            var rangeWidth = (range.right - range.left) * contentW - 2; // -2 for borders
            var rangeTop = ((range.start - section.axis.start) / sectionRange) * contentH;
            var rangeHeight = ((range.end - range.start) / sectionRange) * contentH - 2; // -2 for borders

            $rangeDiv.css("left", rangeLeft);
            $rangeDiv.css("width", rangeWidth);
            $rangeDiv.css("top", rangeTop);
            $rangeDiv.css("height", rangeHeight);
            $rangeDiv.css("line-height", rangeHeight + "px");
            $rangeDiv.css("background-color", range.bgcolor);

            if (range.name) {
                var $textSpan;
                if (range.href) {
                    $textSpan = $("<span class=\"overlay-link\" data-href=\"" + range.href + "\">" + range.name + "</span>");
                }
                else {
                    $textSpan = $("<span>" + range.name + "</span>");
                }
                $rangeDiv.append($textSpan);

                var display = $panel.css("display");
                $panel.css("display", "block");

                var labelrotation = range.labelrotation;
                if (labelrotation !== 0.0) {

                    var textW = $textSpan.outerWidth();
                    var marginLeft = textW > rangeWidth ? (textW - rangeWidth) / -2.0 : 0;

                    var styles = {
                        "display": "inline-block",
                        "line-height": "normal",
                        "margin-left": marginLeft + "px",
                        "-webkit-transform": "rotate(" + labelrotation + "deg)",
                        "-moz-transform": "rotate(" + labelrotation + "deg)",
                        "-o-transform": "rotate(" + labelrotation + "deg)",
                        "writing-mode": "lr-tb"
                    };

                    $textSpan.css(styles);

                    if ($textSpan.outerHeight() > $rangeDiv.outerWidth() || $textSpan.outerWidth() > $rangeDiv.outerHeight()) {
                        $textSpan.css("display", "none");
                    }
                } else {
                    if ($textSpan.outerWidth() > $rangeDiv.outerWidth() || $textSpan.outerHeight() > $rangeDiv.outerHeight()) {
                        $textSpan.css("display", "none");
                    }
                }

                $panel.css("display", display);
            }
        }
    }
};

TimeSlider.prototype.findTimelineEvents = function(events) {
    var eventRegex = new RegExp("(^|,)\s*timeline\s*($|,)", "i");
    this.timelineEvents = $.grep(events, function(e) {
        return eventRegex.test(e.tags);
    });
};

TimeSlider.prototype.showTimelineEvents = function(time) {
    var showTime = -1.0;

    var $eventBox = $(".timeslider-eventbox");

    var thisTS = this;
    $(".timeslider-eventpopup", $eventBox).each(function() {
        var offset = $(this).data("offset");

        //TODO: change test below to something more reasonable??? some percentage of range perhaps???
        var visible = Math.abs(time - offset) < (thisTS.scrubberStep < 10 ? thisTS.scrubberStep : thisTS.scrubberStep * 2.0);
        if (visible && showTime < 0.0) {
            showTime = offset;
        }

        $(this).toggle(visible);
    });

    if (showTime > 0.0) {
        var $rulerbox = $('.timeslider-box', this.$container);
        var totH = $rulerbox.height() - this.scrubberOffset * 2;
        var range = this.rangeMax - this.rangeMin;
        var eventTop = ((showTime - this.rangeMin) / range) * totH + this.scrubberOffset + $rulerbox.offset().top;
        $eventBox.css("top", eventTop);
    }
    
};

TimeSlider.prototype.loadSection = function(section) {
    this.rangeMin = section.axis.start;
    this.rangeMax = section.axis.end;

    app.clock.minTime = this.rangeMin;
    app.clock.maxTime = this.rangeMax;

    var range = this.rangeMax - this.rangeMin;
    this.scrubberStep = range <= 100 ? 2 : range <= 1000 ? 5 : 10; //better way? in the timeline somewhere?

    // set header text
    $(".timeslider-legend", this.$container).html(section.axis.legend);

    var $header = $(".timeslider-header", this.$container);
    $(".timeslider-heading", $header).remove();

    var headerWidth = $('.timeslider-content', this.$container).width();

    for (var i=0; i < section.headings.length; i++) {
        var heading = section.headings[i];
        var headingLeft = heading.left * headerWidth;
        $header.append("<div class=\"timeslider-heading" + (i === 0 ? " first" : "") + "\" style=\"left:" + headingLeft + "px;\">" + heading.name + "</div>");
    }


    this.findTimelineEvents(section.events);

    this.redrawSlider();

    // set time to 0 or the axis' start value if 0 is not within the range
    var startTime = 0.0;
    if (this.rangeMin > 0.0 || this.rangeMax < 0.0) {
        startTime = this.rangeMin;
    }
    
    this.updateTime(startTime); // need to call here manually because clock won't fire timeChanged event if already the same
    app.clock.setTime(startTime);
};

TimeSlider.prototype.loadTimeline = function() {
    this.timeline = app.timeline;

    var $content = $('.timeslider-content', this.$container);

    $content.empty();

    if (this.timeline.sections.length === 0) {
        return;
    }

    var defaultId = 0;
    for (var i = 0; i < this.timeline.sections.length; i++) {
        var isDefault = false;
        if (this.timeline.sections[i].name === this.timeline.defaultsection) {
            isDefault = true;
            defaultId = i;
        }

        $content.append("<div class=\"accordion-toggle\" data-section=\"" + i + "\">" + this.timeline.sections[i].name + "</div><div class=\"accordion-content" + (isDefault ? " default" : "") + "\"></div>");
    }

    //hook up accordion events
    var thisTS = this;
    $content.find('.accordion-toggle').click(function() {

        //Expand or collapse this panel
        $(this).next().slideDown('fast');

        //Hide the other panels
        $(".accordion-content", $content).not($(this).next()).slideUp('fast');

        var sectionId = $(this).data("section");
        thisTS.sectionId = sectionId;
        thisTS.timeline.setCurrentSection(sectionId);
    });

    this.redrawContent();

    this.sectionId = defaultId;
    this.timeline.setCurrentSection(defaultId);
};

TimeSlider.prototype.onWindowResize = function(e) {
    this.redraw();
};

module.exports = TimeSlider;
},{"./app.js":4,"underscore":22}],15:[function(require,module,exports){
module.exports = {
	hasTag: function(obj, tag) {
		var eventRegex = new RegExp("(^|,)\s*" + tag + "\s*($|,)", "i");
		return eventRegex.test(obj.tags);
    }
};
},{}],16:[function(require,module,exports){
var app = require("./app.js");

// Hooks up VCR controls
function VCR() {
    $('.vcr-ctrl').click(function() {

        var playSpeed = $(this).data("playspeed");
        if (playSpeed === 0) {
            app.stopAnimating();
            app.clock.pause();
        } else {
            app.startAnimating();
            app.clock.play(playSpeed);
        }
    });

    app.clock.on("stateChanged", function() {
        // Remove active from all the vcr controls.
        $('.vcr-ctrl').removeClass("active");

        // Activate the appropriate button.
        if (app.clock.state == "paused") {
            $("#vcr_pause").addClass("active");
            app.stopAnimating();
        }
        else if (app.clock.state == "playing") {
            $("[data-playspeed='" + app.clock.direction + "']").addClass("active");
        }
    });

    // If the section changes then stop playback.
    app.timeline.on("sectionChanged", function() {
        app.clock.pause();
    });
}

module.exports = VCR;
},{"./app.js":4}],17:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],18:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],19:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;

function drainQueue() {
    if (draining) {
        return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        var i = -1;
        while (++i < len) {
            currentQueue[i]();
        }
        len = queue.length;
    }
    draining = false;
}
process.nextTick = function (fun) {
    queue.push(fun);
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],20:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],21:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":20,"_process":19,"inherits":18}],22:[function(require,module,exports){
//     Underscore.js 1.6.0
//     http://underscorejs.org
//     (c) 2009-2014 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.6.0';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return obj;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
    return obj;
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var result;
    any(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(predicate, context);
    each(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, function(value, index, list) {
      return !predicate.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(predicate, context);
    each(obj, function(value, index, list) {
      if (!(result = result && predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(predicate, context);
    each(obj, function(value, index, list) {
      if (result || (result = predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matches(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matches(attrs));
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    var result = -Infinity, lastComputed = -Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed > lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    var result = Infinity, lastComputed = Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed < lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Shuffle an array, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisherâ€“Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (obj.length !== +obj.length) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return value;
    return _.property(value);
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    iterator = lookupIterator(iterator);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, iterator, context) {
      var result = {};
      iterator = lookupIterator(iterator);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    _.has(result, key) ? result[key].push(value) : result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[0];
    if (n < 0) return [];
    return slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[array.length - 1];
    return slice.call(array, Math.max(array.length - n, 0));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Split an array into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(array, predicate) {
    var pass = [], fail = [];
    each(array, function(elem) {
      (predicate(elem) ? pass : fail).push(elem);
    });
    return [pass, fail];
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.contains(other, item);
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, 'length').concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    return function() {
      var position = 0;
      var args = boundArgs.slice();
      for (var i = 0, length = args.length; i < length; i++) {
        if (args[i] === _) args[i] = arguments[position++];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return func.apply(this, args);
    };
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error('bindAll must be passed function names');
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
        context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function() {
      var last = _.now() - timestamp;
      if (last < wait) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))
                        && ('constructor' in a && 'constructor' in b)) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  _.constant = function(value) {
    return function () {
      return value;
    };
  };

  _.property = function(key) {
    return function(obj) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of `key:value` pairs.
  _.matches = function(attrs) {
    return function(obj) {
      if (obj === attrs) return true; //avoid comparing an object to itself.
      for (var key in attrs) {
        if (attrs[key] !== obj[key])
          return false;
      }
      return true;
    }
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() { return new Date().getTime(); };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}).call(this);

},{}]},{},[10]);
