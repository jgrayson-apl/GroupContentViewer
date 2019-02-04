/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/ApplicationBase",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/number",
  "dojo/date",
  "dojo/query",
  "dojo/on",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "Application/widgets/GroupCategoryCrumbs",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/identity/IdentityManager",
  "esri/portal/Portal",
  "esri/portal/PortalItem",
  "esri/request",
  "esri/Map",
  "esri/views/MapView",
  "esri/views/SceneView",
  "esri/layers/Layer",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/Compass",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Expand"
], function (calcite, declare, lang, i18n, ApplicationBase, itemUtils, domHelper,
             number, date, query, on, dom, domClass, domConstruct,
             GroupCategoryCrumbs,
             Evented, watchUtils, promiseUtils, IdentityManager,
             Portal, PortalItem, esriRequest,
             EsriMap, MapView, SceneView, Layer,
             Home, Search, Compass, LayerList, Legend, BasemapGallery, Expand) {

  /**
   *
   * http://doc.arcgis.com/en/arcgis-online/create-maps/configurable-templates.htm
   *
   */
  return declare([Evented], {

    /**
     *
     */
    constructor: function () {
      // CSS //
      this.CSS = {
        loading: "configurable-application--loading",
        NOTIFICATION_TYPE: {
          MESSAGE: "alert alert-blue animate-in-up is-active inline-block",
          SUCCESS: "alert alert-green animate-in-up is-active inline-block",
          WARNING: "alert alert-yellow animate-in-up is-active inline-block",
          ERROR: "alert alert-red animate-in-up is-active inline-block"
        }
      };
      // BASE APPLICATION //
      this.base = null;
      // CALCITE //
      calcite.init();
    },

    /**
     *
     * @param base
     * @returns {*}
     */
    init: function (base) {
      // BASE APPLICATION //
      this.base = base;

      // LOCALE AND DIRECTION //
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      // LOCALIZED DEFAULT UI COMPONENTS //
      Object.keys(i18n.ui).forEach(node_id => {
        const ui_component = dom.byId(node_id);
        if(ui_component) {
          ui_component.innerHTML = i18n.ui[node_id].innerHTML || "";
          ui_component.title = i18n.ui[node_id].title || "";
        }
      });

      // APP TITLE //
      domHelper.setPageTitle(this.base.config.title);
      dom.byId("app-title-node").innerHTML = this.base.config.title;

      // USER SIGN IN //
      return this.initializeUserSignIn().always(() => {

        // CREATE MAP //
        this.createMap().then((map_infos) => {

          // SYNC VIEWS //
          this.initializeSynchronizedViews(map_infos.views);

          // VIEW TYPE SWITCH //
          this.initializeViewTypeSwitch(map_infos.views);

          // INITIALIZE CONTENT //
          this.initializeGroupContent(map_infos.map, this.base.config.group);

          // INITIALIZE CREATE MAP //
          this.initializeCreateOnlineMap(map_infos);

          // REMOVE LOADING //
          document.body.classList.remove(this.CSS.loading);
        });

      });
    },

    /**
     *
     * @param views
     */
    initializeViewTypeSwitch: function (views) {

      // DISPLAY TYPE SWITCH //
      const display_switch = dom.byId("display-type-input");
      on(display_switch, "change", () => {
        const view_type = display_switch.checked ? "3d" : "2d";
        views.forEach((view, type) => {
          domClass.toggle(view.container, "visually-hidden", (type !== view_type));
        });
        this.emit("view-type-change", { type: view_type });
      });
      // INITIALLY HIDE THE 3D VIEW //
      domClass.add(views.get("3d").container, "visually-hidden");

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function (force_sign_in) {

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user) {
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.setUserFavorites();
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({ url: this.base.config.portalUrl });
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.setUserFavorites();
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode) {
        on(signOutNode, "click", userSignOut);
      }

      return force_sign_in ? userSignIn() : checkSignInStatus();
    },

    /**
     *
     */
    createMap: function () {

      // MAP //
      const map = new EsriMap({
        basemap: this.base.config.usePortalBasemap ? this.base.portal.defaultBasemap : { portalItem: { id: "39858979a6ba4cfd96005bbe9bd4cf82" } },
        ground: "world-elevation"
      });

      // SET VISIBILITY OF ALL MAP LAYERS //
      this.setAllLayersVisibility = (visible) => {
        map.layers.forEach(layer => {
          layer.visible = visible;
        });
      };

      // MAP VIEW //
      const createMapView = this.createView(map, "2d", "map-node");
      // SCENE VIEW //
      const createSceneView = this.createView(map, "3d", "scene-node");

      // RETURN VIEWS WHEN CREATED //
      return promiseUtils.eachAlways([createMapView, createSceneView]).then(createViewsResults => {
        // RETURN THE MAP AND VIEWS //
        return createViewsResults.reduce((map_info, createViewsResult) => {
          map_info.views.set(createViewsResult.value.type, createViewsResult.value);
          return map_info;
        }, { map: map, views: new Map() });
      });
    },

    /**
     *
     * @param map
     * @param type
     * @param container_id
     * @returns {*}
     */
    createView: function (map, type, container_id) {

      // EARTH RADIUS //
      const EARTH_RADIUS = 6371000;

      // VIEW SETTINGS //
      const view_settings = {
        container: container_id,
        map: map,
        center: [5.0, 20.0],
        zoom: 3,
        constraints: (type === "2d") ? { snapToZoom: false } : { altitude: { max: (EARTH_RADIUS * 6) } },
        highlightOptions: {
          color: "#00c0eb",
          haloOpacity: 0.8,
          fillOpacity: 0.2
        }
      };

      // VIEW //
      const view = (type === "2d") ? new MapView(view_settings) : new SceneView(view_settings);
      return view.when(() => {

        // LEFT CONTAINER //
        const left_container = dom.byId("group-container");
        // PANEL TOGGLE //
        const panelToggleBtn = domConstruct.create("div", {
          className: "panel-toggle-left icon-ui-left-triangle-arrow icon-ui-flush font-size-1",
          title: i18n.map.left_toggle.title
        }, view.root);
        on(panelToggleBtn, "click", () => {
          // TOGGLE PANEL TOGGLE BTNS //
          query(".panel-toggle-left").toggleClass("icon-ui-left-triangle-arrow icon-ui-right-triangle-arrow");
          // TOGGLE VISIBILITY OF CLOSABLE PANELS //
          domClass.toggle(left_container, "collapsed");
        });

        // LOADING //
        const updating_node = domConstruct.create("div", { className: "view-loading-node loader text-center padding-leader-0 padding-trailer-0" });
        domConstruct.create("div", { className: "loader-bars" }, updating_node);
        domConstruct.create("div", { className: "loader-text font-size--3", innerHTML: "Updating..." }, updating_node);
        view.ui.add(updating_node, "bottom-right");
        watchUtils.init(view, "updating", (updating) => {
          domClass.toggle(updating_node, "is-active", updating);
        });

        // POPUP DOCKING OPTIONS //
        // TODO: FIGURE OUT HOW TO SYNC POPUP WINDOWS...
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "bottom-left"
        };

        // SEARCH //
        const search = new Search({ view: view, searchTerm: this.base.config.search || "" });
        view.ui.add(search, { position: "top-left", index: 0 });

        // BASEMAPS //
        const basemapGalleryExpand = new Expand({
          view: view,
          content: new BasemapGallery({ view: view }),
          expandIconClass: "esri-icon-basemap",
          expandTooltip: i18n.map.basemapExpand.tooltip
        });
        view.ui.add(basemapGalleryExpand, { position: "top-left", index: 1 });

        // HOME //
        const homeWidget = new Home({ view: view });
        view.ui.add(homeWidget, { position: "top-left", index: 2 });

        // VIEW TYPE SPECIFIC //
        if(view.type === "2d") {
          // MapView //
          const compass = new Compass({ view: view });
          view.ui.add(compass, { position: "top-left", index: 5 });
        } else {
          // SceneView //
          this.initializeViewSpinTools(view);
        }

        // INITIALIZE LAYER LIST //
        this.initializeLayerList(view);

        // RETURN THE VIEW //
        return view;
      });

    },

    /**
     *
     * @param view
     */
    initializeLayerList: function (view) {

      // LAYERS PANEL //
      const layers_panel = domConstruct.create("div", { className: "panel panel-no-padding" });
      const action_node = domConstruct.create("div", { className: "panel panel-dark-blue panel-no-padding padding-left-half padding-right-1 font-size-0" }, layers_panel);
      domConstruct.create("span", { innerHTML: i18n.map.layers_panel.label }, action_node);

      // REMOVE ALL LAYERS //
      const remove_layers_btn = domConstruct.create("span", {
        className: "icon-ui-close-circled icon-ui-flush esri-interactive right",
        title: i18n.map.remove_layers.title
      }, action_node);
      on(remove_layers_btn, "click", () => {
        view.map.layers.removeAll();
      });

      // SET LAYERS VISIBILITY //
      const show_layers_btn = domConstruct.create("span", {
        className: "icon-ui-checkbox-checked esri-interactive right",
        title: i18n.map.show_layers.title
      }, action_node);
      on(show_layers_btn, "click", () => {
        this.setAllLayersVisibility(true);
      });
      const hide_layers_btn = domConstruct.create("span", {
        className: "icon-ui-checkbox-unchecked esri-interactive right",
        title: i18n.map.hide_layers.title
      }, action_node);
      on(hide_layers_btn, "click", () => {
        this.setAllLayersVisibility(false);
      });

      // CREATE OPACITY NODE //
      const createOpacityNode = (item, parent_node) => {
        const opacity_node = domConstruct.create("div", {
          className: "layer-opacity-node esri-widget",
          title: i18n.map.layer_opacity.title
        }, parent_node);
        const opacity_input = domConstruct.create("input", {
          className: "opacity-input",
          type: "range", min: 0, max: 1.0, step: 0.01,
          value: item.layer.opacity
        }, opacity_node);
        on(opacity_input, "input", () => {
          item.layer.opacity = opacity_input.valueAsNumber;
        });
        item.layer.watch("opacity", (opacity) => {
          opacity_input.valueAsNumber = opacity;
        });
        opacity_input.valueAsNumber = item.layer.opacity;
        return opacity_node;
      };
      // CREATE TOOLS NODE //
      const createToolsNode = (item, parent_node) => {
        // TOOLS NODE //
        const tools_node = domConstruct.create("div", { className: "esri-widget" }, parent_node, "first");

        // REORDER //
        const reorder_node = domConstruct.create("div", { className: "inline-block" }, tools_node);
        const reorder_up_node = domConstruct.create("button", {
          className: "btn-link esri-icon-arrow-up",
          title: i18n.map.move_layer_up.title
        }, reorder_node);
        const reorder_down_node = domConstruct.create("button", {
          className: "btn-link esri-icon-arrow-down",
          title: i18n.map.move_layer_down.title
        }, reorder_node);
        on(reorder_up_node, "click", () => {
          view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) + 1);
        });
        on(reorder_down_node, "click", () => {
          view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) - 1);
        });

        // REMOVE LAYER //
        const remove_layer_node = domConstruct.create("button", {
          className: "btn-link icon-ui-close right",
          title: i18n.map.remove_layer.title
        }, tools_node);
        on.once(remove_layer_node, "click", () => {
          view.map.remove(item.layer);
          this.emit("layer-removed", item.layer);
        });

        // ZOOM TO //
        const zoom_to_node = domConstruct.create("button", {
          className: "btn-link icon-ui-zoom-in-magnifying-glass right",
          title: i18n.map.zoom_to_layer.title
        }, tools_node);
        on(zoom_to_node, "click", () => {
          view.goTo(item.layer.fullExtent);
        });

        // LAYER DETAILS //
        const info_node = domConstruct.create("span", {
          className: "btn-link icon-ui-description icon-ui-blue right",
          title: i18n.map.view_details.title
        }, tools_node);
        on(info_node, "click", () => {
          this.displayItemDetails(item.layer.portalItem);
        });

        return tools_node;
      };
      // CREATE LEGEND NODE //
      const createLegendNode = (item, parent_node) => {

        const legend_panel = domConstruct.create("div", { className: "legend-panel esri-widget" }, parent_node);

        const legend = new Legend({
          container: domConstruct.create("div", {}, legend_panel),
          view: view,
          layerInfos: [{ layer: item.layer }]
        });

        const legend_toggle_node = domConstruct.create("button", {
          className: "legend-toggle btn-link icon-ui-down",
          title: i18n.map.legend_toggle.title
        }, legend_panel);
        const legend_toggle_label = domConstruct.create("div", {
          className: "font-size--2 inline-block hide",
          innerHTML: i18n.map.legend_label.innerHTML
        }, legend_toggle_node);

        on(legend_toggle_node, "click", () => {
          domClass.toggle(legend_toggle_label, "hide");
          domClass.toggle(legend_toggle_node, "legend-toggle-hidden icon-ui-down icon-ui-right");
          domClass.toggle(legend.domNode, "hide");
        });

      };
      // LAYER LIST //
      const layerList = new LayerList({
        view: view,
        container: domConstruct.create("div", {}, layers_panel),
        listItemCreatedFunction: (evt) => {
          let item = evt.item;
          if(item.layer && item.layer.portalItem) {

            // CREATE ITEM PANEL //
            const panel_node = domConstruct.create("div", { className: "esri-widget" });

            // LAYER TOOLS //
            createToolsNode(item, panel_node);

            // LAYER OPACITY //
            createOpacityNode(item, panel_node);

            // LEGEND //
            if(item.layer.legendEnabled) {
              createLegendNode(item, panel_node);
            }

            // SET ITEM PANEL //
            item.panel = {
              title: i18n.map.settings_panel.title,
              className: "esri-icon-settings",
              content: panel_node
            };
          }
        }
      });
      const layerListExpand = new Expand({
        view: view,
        content: layers_panel,
        iconNumber: 0,
        expandIconClass: "esri-icon-layers",
        expandTooltip: i18n.map.layerlist_expand.tooltip
      });
      view.ui.add(layerListExpand, { position: "top-right", index: 1 });

      // LAYER COUNT //
      view.map.layers.on("change", () => {
        layerListExpand.iconNumber = view.map.layers.length;
      });

      // SYNCHRONIZE LAYERLIST EXPANDS //
      layerListExpand.watch("expanded", (expanded) => {
        this.emit("layerlist-expanded", { expanded: expanded, source: layerListExpand });
      });
      this.on("layerlist-expanded", evt => {
        if((evt.source !== layerListExpand) && (evt.expanded !== layerListExpand.expanded)) {
          layerListExpand.toggle();
        }
      });

    },

    /**
     *
     * @param view
     */
    initializeViewSpinTools: function (view) {

      let spin_direction = "none";
      let spin_handle = null;
      let spin_step = 0.05;
      const spin_fps = 60;

      const _spin = () => {
        if(spin_direction !== "none") {
          const camera = view.camera.clone();
          // WHAT IS THE APPROPRIATE ZOOM LEVEL TO SWITCH BETWEEN LOCAL AND GLOBAL? //
          if(view.zoom > 9) {
            // AT A 'LOCAL' SCALE WE CHANGE THE HEADING //
            camera.heading += ((spin_direction === "right") ? spin_step : -spin_step);
          } else {
            // AT A GLOBAL SCALE WE CHANGE THE LONGITUDE //
            camera.position.longitude += ((spin_direction === "right") ? spin_step : -spin_step);
            // MAINTAIN CURRENT HEADING OR FORCE UP //
            camera.heading = always_up ? 0.0 : camera.heading;
          }
          spin_handle = view.goTo(camera, { animate: false }).then(() => {
            if(spin_direction !== "none") {
              setTimeout(() => {
                requestAnimationFrame(_spin);
              }, (1000 / spin_fps));
            }
          });
        }
      };

      const enableSpin = (direction) => {
        spin_direction = direction;
        if(spin_direction !== "none") {
          requestAnimationFrame(_spin);
        } else {
          spin_handle && !spin_handle.isFulfilled() && spin_handle.cancel();
        }
      };

      let previous_direction = "none";
      this.spin_pause = () => {
        previous_direction = spin_direction;
        enableSpin("none");
      };
      this.spin_resume = () => {
        enableSpin(previous_direction);
      };

      const viewSpinNode = domConstruct.create("div", { className: "view-spin-node" }, view.root);
      const spinLeftBtn = domConstruct.create("span", { className: "spin-btn icon-ui-arrow-left-circled icon-ui-flush font-size-2 esri-interactive", title: i18n.spin_tool.spin_left.title }, viewSpinNode);
      const alwaysUpBtn = domConstruct.create("span", { id: "always-up-btn", className: "spin-btn icon-ui-compass icon-ui-flush font-size--1 esri-interactive", title: i18n.spin_tool.always_up.title }, viewSpinNode);
      const spinRightBtn = domConstruct.create("span", { className: "spin-btn icon-ui-arrow-right-circled icon-ui-flush font-size-2 esri-interactive", title: i18n.spin_tool.spin_right.title }, viewSpinNode);

      // SPIN LEFT //
      on(spinLeftBtn, "click", () => {
        enableSpin("none");
        domClass.remove(spinRightBtn, "selected");
        domClass.toggle(spinLeftBtn, "selected");
        if(domClass.contains(spinLeftBtn, "selected")) {
          enableSpin("left");
        }
      });

      // SPIN RIGHT //
      on(spinRightBtn, "click", () => {
        enableSpin("none");
        domClass.remove(spinLeftBtn, "selected");
        domClass.toggle(spinRightBtn, "selected");
        if(domClass.contains(spinRightBtn, "selected")) {
          enableSpin("right");
        }
      });

      // ALWAYS UP //
      let always_up = false;
      on(alwaysUpBtn, "click", () => {
        domClass.toggle(alwaysUpBtn, "selected");
        always_up = domClass.contains(alwaysUpBtn, "selected");
      });

      /*view.on("layerview-create", (evt) => {
        const layerView = evt.layerView;
        layerView.when(() => {
          this.spin_pause();
          watchUtils.whenTrueOnce(layerView, "updating", () => {
            watchUtils.whenFalseOnce(layerView, "updating", () => {
              this.spin_resume();
            });
          });
        });
      });*/

    },

    /**
     *
     * @param views_infos
     */
    initializeSynchronizedViews: function (views_infos) {

      // SYNC VIEW //
      const synchronizeView = (view, others) => {
        others = Array.isArray(others) ? others : [others];

        let viewpointWatchHandle;
        let viewStationaryHandle;
        let otherInteractHandlers;
        let scheduleId;

        const clear = () => {
          if(otherInteractHandlers) {
            otherInteractHandlers.forEach((handle) => {
              handle.remove();
            });
          }
          viewpointWatchHandle && viewpointWatchHandle.remove();
          viewStationaryHandle && viewStationaryHandle.remove();
          scheduleId && clearTimeout(scheduleId);
          otherInteractHandlers = viewpointWatchHandle = viewStationaryHandle = scheduleId = null;
        };

        const interactWatcher = view.watch('interacting,animation', (newValue) => {
          if(!newValue) { return; }
          if(viewpointWatchHandle || scheduleId) { return; }

          if(!view.animation) {
            others.forEach((otherView) => {
              otherView.viewpoint = view.viewpoint;
            });
          }

          // start updating the other views at the next frame
          scheduleId = setTimeout(() => {
            scheduleId = null;
            viewpointWatchHandle = view.watch('viewpoint', (newValue) => {
              others.forEach((otherView) => {
                otherView.viewpoint = newValue;
              });
            });
          }, 0);

          // stop as soon as another view starts interacting, like if the user starts panning
          otherInteractHandlers = others.map((otherView) => {
            return watchUtils.watch(otherView, 'interacting,animation', (value) => {
              if(value) { clear(); }
            });
          });

          // or stop when the view is stationary again
          viewStationaryHandle = watchUtils.whenTrue(view, 'stationary', clear);
        });

        return {
          remove: () => {
            this.remove = () => {
            };
            clear();
            interactWatcher.remove();
          }
        }
      };
      // SYNC VIEWS //
      const synchronizeViews = (views) => {
        let handles = views.map((view, idx, views) => {
          const others = views.concat();
          others.splice(idx, 1);
          return synchronizeView(view, others);
        });

        return {
          remove: () => {
            this.remove = () => {
            };
            handles.forEach((h) => {
              h.remove();
            });
            handles = null;
          }
        }
      };

      // INIT SYNC VIEWS //
      synchronizeViews(Array.from(views_infos.values()));
    },

    /**
     *
     * @param map
     * @param group_id
     */
    initializeGroupContent: function (map, group_id) {

      if(this.category_filter_change) {
        this.category_filter_change.remove();
      }
      if(this.groupCategoryFilter) {
        this.groupCategoryFilter.destroy();
      }

      if(this.search_input_handle) {
        this.search_input_handle.remove();
      }
      if(this.search_change_handle) {
        this.search_change_handle.remove();
      }
      if(this.sort_handle) {
        this.sort_handle.remove();
      }

      // FIND GROUP //
      this.base.portal.queryGroups({ query: `id:${group_id}` }).then((groupResponse) => {

        if(groupResponse.results.length > 0) {

          // GROUP //
          const portal_group = groupResponse.results[0];

          // GROUP TITLE //
          dom.byId("group-title-label").innerHTML = portal_group.title;
          dom.byId("group-title-label").title = portal_group.snippet;
          // GROUP DETAILS LINK //
          dom.byId("group-details-link").href = `${this.base.portal.url}/home/group.html?id=${portal_group.id}`;
          // GROUP THUMBNAIL//
          dom.byId("group-thumb").src = portal_group.getThumbnailUrl();

          // USER FAVORITES //
          this.setUserFavorites().then(() => {

            // SEARCH ITEMS //
            const resetItemSearch = () => {
              // RESET LIST //
              dom.byId("group-items-list").innerHTML = "";
              domClass.remove("group-items-list", "btn-disabled");
              // SEARCH FOR GROUP ITEMS //
              this.getGroupItems_BySearch(map, portal_group, 1).then(updateSearchResultsUI);
            };

            // UPDATE SEARCH RESULTS UI //
            const updateSearchResultsUI = (queryResults) => {

              // NEXT START //
              const nextStart = queryResults.nextQueryParams.start || 1;

              // ITEMS COUNT //
              dom.byId("results-total").innerHTML = number.format(queryResults.total);
              domClass.toggle("results-total", "avenir-demi", (queryResults.total > 0));
              dom.byId("results-start").innerHTML = (queryResults.total > 0) ? "1" : "0";

              // NEXT ITEMS //
              domClass.toggle("results-next", "hide", (nextStart === -1));
              on.once(dom.byId("results-next"), "click", () => {
                this.getGroupItems_BySearch(map, portal_group, nextStart).then(updateSearchResultsUI);
              });
            };

            // SEARCH INPUT //
            const search_input = dom.byId("search_query_input");
            this.search_input_handle = on(search_input, "input", () => {
              domClass.add("group-items-list", "btn-disabled");
            });
            this.search_change_handle = on(search_input, "change", () => {
              resetItemSearch();
            });

            // SORT ORDER //
            this.sort_handle = on(dom.byId("sort-order-input"), "change", () => {
              resetItemSearch();
            });

            // CATEGORY FILTER //
            this.groupCategoryFilter = new GroupCategoryCrumbs({
              container: dom.byId("group-category-filter"),
              displayTitle: false,
              portalGroup: portal_group
            });
            this.category_filter_change = this.groupCategoryFilter.on("change", () => {
              resetItemSearch();
            });

          });

        } else {

          // WE DIDN'T FIND THE GROUP, SO LET'S FORCE THE USER TO SIGN IN AND TRY AGAIN //
          this.initializeUserSignIn(true).always(() => {
            this.initializeGroupContent(map, group_id);
          });

        }
      });

    },

    /**
     *
     * @returns {*}
     */
    setUserFavorites: function () {
      // USER FAVORITES //
      this.user_favorites = new Map();
      // USER //
      if(this.base.portal.user) {
        return this.base.portal.user.queryFavorites({ num: 100 }).then((favoritesResults) => {
          favoritesResults.results.forEach(favorite => {
            this.user_favorites.set(favorite.id, favorite);
          });
          this.emit("user-favorites-change", {});
          return this.user_favorites;
        });
      } else {
        this.emit("user-favorites-change", {});
        return promiseUtils.resolve(this.user_favorites);
      }
    },

    /**
     *
     * @param map
     * @param portalGroup
     * @param start
     */
    getGroupItems_BySearch: function (map, portalGroup, start) {

      let categories = null;
      if(this.groupCategoryFilter.categorySchema != null) {
        const category_path = this.groupCategoryFilter.value.path;
        if(category_path) {
          categories = [category_path];
        }
      }

      const sortField = dom.byId("sort-order-input").checked ? "num-views" : "modified";
      const sortOrder = "desc";

      const layers_query = `type:Service AND typekeywords:(-"Tool" -"Geodata Service" -"Globe Service" -"Database" -"Workflow" -"Service Definition") AND (culture:${this.base.locale})`;

      const search_text = dom.byId("search_query_input").value;
      const search_query = (search_text && (search_text.length > 0)) ? `(${search_text}) AND (${layers_query})` : `(${layers_query})`;

      if(this.query_items_handle && !this.query_items_handle.isFulfilled()) {
        this.query_items_handle.cancel();
      }
      return this.query_items_handle = portalGroup.queryItems({
        start: start,
        num: 100,
        categories: categories,
        query: search_query,
        sortField: sortField,
        sortOrder: sortOrder
      }).then((queryResults) => {

        this.addItemsToList(map, queryResults.results);

        return queryResults;
      });
    },

    /**
     *
     * @param map
     * @param group_items
     */
    addItemsToList: function (map, group_items) {

      // ITEMS LIST //
      const itemsList = dom.byId("group-items-list");

      // ITEM CARDS //
      group_items.forEach(item => {
        this._createItemCard(item, itemsList, map);
      });

      // RESULTS COUNT //
      dom.byId("results-count").innerHTML = number.format(query(".item-card", itemsList).length);

    },

    /**
     *
     * @param item
     * @param itemsList
     * @param map
     * @private
     */
    _createItemCard: function (item, itemsList, map) {

      if(item.declaredClass !== "esri.portal.PortalItem") {
        item.thumbnailUrl = `${this.base.config.portalUrl}/sharing/content/items/${item.id}/info/${item.thumbnail}`
      }

      // ITEM CARD NODE //
      const cardNode = domConstruct.create("div", { className: "item-card card-wide trailer-quarter" }, itemsList);
      const cardContentNode = domConstruct.create("div", { className: "card-content trailer-0" }, cardNode);

      // TITLE //
      const titleNode = domConstruct.create("div", { className: "margin-left-half trailer-quarter" }, cardContentNode);
      // ITEM ICON //
      domConstruct.create("img", { className: "item-icon margin-right-quarter", src: item.iconUrl }, titleNode);
      // DETAILS PAGE //
      const itemDetailsPageUrl = `${this.base.portal.url}/home/item.html?id=${item.id}`;
      domConstruct.create("a", { className: "font-size-1 link-blue", innerHTML: item.title, title: `${item.displayName} by ${item.owner}`, target: "_blank", href: itemDetailsPageUrl }, titleNode);

      // THUMBNAIL //
      const figureNode = domConstruct.create("figure", { className: "card-wide-image-wrap leader-0 margin-right-half left" }, cardContentNode);
      domConstruct.create("img", { className: "card-image", src: item.thumbnailUrl || "./images/no_preview.gif", alt: item.title }, figureNode);

      // FAVORITES //
      const favoritesNode = domConstruct.create("span", {
        className: "font-size-0 icon-ui-favorites icon-ui-flush esri-interactive margin-left-1 right hide"
      }, titleNode);
      const updateFavoritesNode = () => {
        const is_favorite = ((this.user_favorites.size > 0) && this.user_favorites.has(item.id));
        domClass.toggle(favoritesNode, "hide", (this.base.portal.user == null));
        domClass.toggle(favoritesNode, "icon-ui-yellow", is_favorite);
        favoritesNode.title = is_favorite ? "Remove from my favorites" : "Add to my favorites";
      };
      this.on("user-favorites-change", updateFavoritesNode);
      updateFavoritesNode();
      on(favoritesNode, "click", () => {

        const is_fav = domClass.contains(favoritesNode, "icon-ui-yellow");
        const is_item_owner = (this.base.portal.user && (this.base.portal.user.username === item.owner.username));
        const share_url = `${is_item_owner ? item.userItemUrl : item.itemUrl}/${is_fav ? "unshare" : "share" }`;

        const share_options = {
          everyone: !is_fav,
          org: false,
          groups: this.base.portal.user.favGroupId,
          f: "json"
        };

        if(!is_item_owner) {
          share_options.items = item.id;
        }

        esriRequest(share_url, { query: share_options, method: "post" }).then(() => {
          if(is_fav) {
            this.user_favorites.delete(item.id);
          } else {
            this.user_favorites.set(item.id, item);
          }
          updateFavoritesNode();
        }).otherwise(console.error);

      });

      // SNIPPET //
      const max_chars = 160;
      const snippet_text = item.snippet || "[No details available...]";
      domConstruct.create("span", {
        className: "item-card-snippet font-size--3",
        innerHTML: (snippet_text.length < max_chars) ? `${snippet_text}` : `${snippet_text.slice(0, max_chars)}...`,
        title: snippet_text
      }, cardContentNode);

      // BOTTOM STUFF //
      const bottomNode = domConstruct.create("div", { className: "panel panel-white panel-no-border padding-leader-0 text-right" }, cardNode);

      // TAGS //
      const tags_node = domConstruct.create("span", {
        className: "margin-right-1 font-size--3 text-blue tooltip tooltip-multiline tooltip-top",
        innerHTML: "tags",
        "aria-label": item.tags.join(", ")
      }, bottomNode);

      // SUBSCRIBER CONTENT //
      //console.info(item.typeKeywords, item.tags);
      const subscriptionRequired = item.typeKeywords.includes("Requires Subscription");
      if(subscriptionRequired) {
        domConstruct.create("span", { className: "subscriber-content-badge inline-block margin-right-1", title: "Subscriber Content" }, bottomNode);
      }

      // ADD TO MAP //
      const addToMapBtn = domConstruct.create("button", { className: "btn btn-small btn-clear", innerHTML: "Add to Map" }, bottomNode);
      const removeFromMapBtn = domConstruct.create("button", { className: "btn btn-small btn-clear btn-red right hide", innerHTML: "Remove from Map" }, bottomNode);

      // ITEM LAYER //
      let itemLayer = map.layers.find(layer => {
        return (layer.portalItem.id === item.id);
      });

      domClass.toggle(addToMapBtn, "hide", (itemLayer != null));
      domClass.toggle(removeFromMapBtn, "hide", (itemLayer == null));

      // ADD TO MAP //
      on(addToMapBtn, "click", () => {
        domClass.add(addToMapBtn, "hide");
        domClass.remove(removeFromMapBtn, "hide");

        this.getItemLayer(item).then((layer) => {
          itemLayer = layer;
          map.add(itemLayer);
          this.addLayerNotification(item);
        }).otherwise(error => {
          this.addLayerNotification(item, error);

          domClass.add(removeFromMapBtn, "hide");
          domClass.remove(addToMapBtn, "hide");
          domClass.add(addToMapBtn, "btn-disabled");
          domConstruct.create("span", {
            className: "leader-quarter icon-ui-error2 icon-ui-red font-size-0 right",
            title: "Unable to add the layer at this time..."
          }, addToMapBtn, "after");

        });

      });

      // REMOVE FROM MAP //
      on(removeFromMapBtn, "click", () => {
        domClass.remove(addToMapBtn, "hide");
        domClass.add(removeFromMapBtn, "hide");
        if(itemLayer) {
          this.emit("layer-removed", itemLayer);
          map.remove(itemLayer);
          itemLayer = null;
        }
      });

      // LAYER REMOVED //
      this.on("layer-removed", removed_layer => {
        if((itemLayer != null) && (removed_layer.id === itemLayer.id)) {
          domClass.remove(addToMapBtn, "hide");
          domClass.add(removeFromMapBtn, "hide");
        }
      });

    },

    /**
     *
     * @param itemLike
     * @returns {Promise<PortalItem>}
     * @private
     */
    _getItem: function (itemLike) {
      if(itemLike.declaredClass === "esri.portal.PortalItem") {
        return promiseUtils.resolve(itemLike);
      } else {
        const item = new PortalItem({ id: itemLike.id });
        return item.load();
      }
    },

    /**
     *
     * @param itemLike
     * @returns {*}
     */
    getItemLayer: function (itemLike) {

      // GET ITEM //
      return this._getItem(itemLike).then((item) => {
        // IS ITEM A LAYER //
        if(item.isLayer) {
          // CREATE LAYER FROM ITEM //
          return Layer.fromPortalItem({ portalItem: item }).then((layer) => {
            // LOAD LAYER //
            return layer.load().then(() => {
              //
              // FETCH ITEM OVERRIDES //
              //
              return layer.portalItem.fetchData().then((item_data) => {
                // DOES LAYER HAVE ANY OVERRIDES //
                if(item_data != null) {
                  // APPLY OVERRIDES //
                  //console.info(item.title, item.type, item_data);

                  if(item_data.hasOwnProperty("visibility")) {
                    layer.visible = item_data.visibility;
                  }
                  if(item_data.hasOwnProperty("opacity")) {
                    layer.opacity = item_data.opacity;
                  }

                  switch (layer.type) {
                    case "map-image":
                      // 4.8 //
                      if(item_data.hasOwnProperty("visibleLayers")) {
                        const visible_layers = item_data.visibleLayers || [];
                        layer.allSublayers.forEach(sublayer => {
                          sublayer.visible = visible_layers.includes(sublayer.id);
                        });
                      }
                      break;
                  }
                }

                // LAYER LOADED OK //
                switch (layer.type) {
                  case "unknown":
                    // LAYER IS UNKNOWN //
                    return promiseUtils.reject(new Error(lang.replace(i18n.errors.layer.layer_unknown_template, item)));
                  case "unsupported":
                    // LAYER IS UNSUPPORTED //
                    return promiseUtils.reject(new Error(lang.replace(i18n.errors.layer.layer_unsupported_template, item)));
                  default:
                    return promiseUtils.resolve(layer);
                }
              });
            }).otherwise(() => {
              // LAYER WAS NOT LOADED //
              return promiseUtils.reject(new Error(layer.loadError));
            });
          }).otherwise(() => {
            // COULDN'T CREATE LAYER FROM ITEM //
            return promiseUtils.reject(new Error(lang.replace(i18n.errors.layer.layer_no_create_template, item)));
          });
        } else {
          // ITEM IS NOT A LAYER //
          return promiseUtils.reject(new Error(lang.replace(i18n.errors.layer.item_not_layer_template, item)));
        }

      });

    },

    /**
     *
     * @param item
     * @param error
     */
    addLayerNotification: function (item, error) {
      const notificationsNode = dom.byId("notifications-node");

      const alertNode = domConstruct.create("div", {
        className: error ? this.CSS.NOTIFICATION_TYPE.ERROR : this.CSS.NOTIFICATION_TYPE.SUCCESS
      }, notificationsNode);

      const alertCloseNode = domConstruct.create("div", { className: "inline-block esri-interactive icon-ui-close margin-left-1 right" }, alertNode);
      on.once(alertCloseNode, "click", () => {
        domConstruct.destroy(alertNode);
      });

      domConstruct.create("div", { innerHTML: error ? error.message : lang.replace(i18n.notifications.layer_added_template, item) }, alertNode);

      if(error != null) {
        const itemDetailsPageUrl = `${this.base.portal.url}/home/item.html?id=${item.id}`;
        domConstruct.create("a", { innerHTML: i18n.notifications.view_details.innerHTML, target: "_blank", href: itemDetailsPageUrl }, alertNode);
      } else {
        setTimeout(() => {
          domClass.toggle(alertNode, "animate-in-up animate-out-up");
          setTimeout(() => {
            domConstruct.destroy(alertNode);
          }, 500)
        }, 2000);
      }

    },

    /**
     * https://doc.arcgis.com/en/arcgis-online/reference/use-url-parameters.htm
     *
     * @param map_infos
     */
    initializeCreateOnlineMap: function (map_infos) {

      // MAP LINK CLICK //
      on(dom.byId("create-map-btn"), "click", () => {

        // CURRENT VIEW //
        const display_type = dom.byId("display-type-input").checked ? "2d" : "3d";
        const view = map_infos.views.get(display_type);

        // MAP VIEWER URL //
        let map_viewer_url_parameters = `center=${view.center.longitude},${view.center.latitude}&level=${Math.floor(view.zoom)}&`;

        // BASEMAP URL //
        if(map_infos.map.basemap.baseLayers.length > 0) {
          // ASSUMES THERE'S ONLY ONE //
          map_viewer_url_parameters += `basemapUrl=${map_infos.map.basemap.baseLayers.getItemAt(0).url}&`;
        }

        // REFERENCE URL //
        if(map_infos.map.basemap.referenceLayers.length > 0) {
          // ASSUMES THERE'S ONLY ONE //
          map_viewer_url_parameters += `basemapReferenceUrl=${map_infos.map.basemap.referenceLayers.getItemAt(0).url}&`;
        }

        // LAYERS //
        const layer_ids = map_infos.map.layers.map(layer => {
          return layer.portalItem.id;
        });
        map_viewer_url_parameters += `layers=${layer_ids.join(",")}`;

        // MAP VIEWER URL //
        const map_viewer_url = `${this.base.portal.url}/home/webmap/viewer.html`;

        // OPEN MAP VIEWER //
        //window.open(`${encodeURI(map_viewer_url)}?${encodeURIComponent(map_viewer_url_parameters)}`);
        window.open(`${map_viewer_url}?${map_viewer_url_parameters}`);
      });

    }

  });

});





