/**
 *
 * GroupCategoryCrumbs
 *  - Simple UI to select group categories
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  2/21/2018 - 0.0.1 -
 * Modified:  2/28/2018 - 0.0.2 - group name as title and categories menu as first crumb, also added value property.
 *
 */
define([
  "esri/core/Accessor",
  "esri/core/Evented",
  "esri/core/promiseUtils",
  "esri/request",
  "esri/portal/PortalGroup",
  "calcite",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-attr",
  "dojo/dom-class",
  "dojo/dom-construct"
], function (Accessor, Evented, promiseUtils, esriRequest, PortalGroup, calcite,
             on, query, dom, domAttr, domClass, domConstruct) {

  const GroupCategoryCrumbs = Accessor.createSubclass([Evented], {
    declaredClass: "GroupCategoryCrumbs",

    properties: {
      container: {
        type: String | HTMLElement,
        value: null,
        set: function (value) {
          this._set("container", (typeof value === 'string') ? dom.byId(value) : value);
        }
      },
      label: {
        type: String,
        value: null
      },
      displayTitle: {
        type: Boolean,
        value: false
      },
      maxDepth: {
        type: Number,
        value: 4
      },
      value: {
        type: Object,
        value: { path: null, category: null }
      },
      source: {
        type: String,
        value: "none" // none or PortalGroup or Organization
      },
      portalGroup: {
        type: PortalGroup,
        value: null,
        set: function (value) {
          this._set("portalGroup", value);
          this.fetchCategorySchema().then((categorySchema) => {
            this.categorySchema = categorySchema;
          });
        }
      },
      categorySchema: {
        type: Object,
        set: function (value) {
          this._set("categorySchema", value);
          if(value) {
            this.initializeUI().then(() => {
              const parent_info = {
                title: this.portalGroup.title,
                description: this.portalGroup.description,
                categories: this.categorySchema
              };
              this._createCrumbNode(parent_info, this.categorySchema[0], 1, true);
            });
          }
        }
      }
    },

    /**
     *
     */
    fetchCategorySchema: function () {

      if(this.portalGroup) {
        return this.portalGroup.fetchCategorySchema().then((categorySchema) => {
          if(categorySchema.length > 0) {
            this.source = "PortalGroup";
            return categorySchema;
          } else {
            if(this.portalGroup.portal.hasCategorySchema) {
              return this.portalGroup.portal.fetchCategorySchema().then((categorySchema) => {
                this.source = "Organization";
                return categorySchema;
              });
            } else {
              if(this.container) {
                const warning_node = domConstruct.create("div", {
                  className: "category-filter font-size--2 avenir-demi leader-0 trailer-0",
                  innerHTML: "Categories",
                  title: "No categories in this Group or Organization..."
                }, this.container);
                domConstruct.create("span", { className: "icon-ui-notice-triangle icon-ui-orange margin-left-half", }, warning_node);
              }
              this.emit("change", this.value);
              promiseUtils.reject(new Error("No categories in this Group or Organization..."))
            }
          }
        });
      } else {
        promiseUtils.reject(new Error("No PortalGroup defined..."));
      }
    },

    /**
     *
     */
    initializeUI: function () {

      if(this.container) {
        // LABEL NODE //
        const label_node = domConstruct.create("label", { className: "category-filter leader-0 trailer-0" }, this.container);

        if(this.displayTitle) {
          domConstruct.create("div", {
            className: "text-blue avenir-demi font-size-1",
            innerHTML: this.label || this.portalGroup.title,
            title: this.portalGroup.description
          }, label_node);
        }

        this.breadcrumbs_node = domConstruct.create("div", { className: "category-breadcrumbs breadcrumbs" }, label_node);

        this.dropdown_node = domConstruct.create("nav", { className: "category-dropdown dropdown js-dropdown crumb hide" }, label_node);

        const dropdown_btn = domConstruct.create("button", {
          className: "category-btn btn btn-transparent dropdown-btn js-dropdown-toggle font-size--2",
          tabindex: 0,
          "aria-haspopup": true,
          "aria-expanded": false,
          innerHTML: "select category"
        }, this.dropdown_node);

        domConstruct.create("span", { className: "icon-ui-down" }, dropdown_btn);

        this.dropdown_menu = domConstruct.create("nav", { className: "dropdown-menu font-size--1", role: "menu" }, this.dropdown_node);
                
        // INITIALIZE CALCITE DROPDOWN //
        calcite.dropdown();

        return promiseUtils.resolve();
      } else {
        return promiseUtils.reject(new Error("No container defined..."));
      }

    },

    /**
     *
     * @param level
     */
    removeCrumbs: function (level) {
      query("span.crumb", this.breadcrumbs_node).forEach(node => {
        if(+domAttr.get(node, "level") >= level) {
          domConstruct.destroy(node);
        }
      });
    },

    /**
     *
     * @param parent
     * @param category
     * @param level
     * @param readOnly
     * @private
     */
    _createCrumbNode: function (parent, category, level, readOnly) {

      const crumbNode = domConstruct.create("span", {
        className: `crumb ${readOnly ? "avenir-demi" : "esri-interactive avenir-italic"}`,
        innerHTML: category.title,
        title: category.description || "",
        level: level
      }, this.breadcrumbs_node);

      this._createSubCategoryMenu(category, level);

      on(crumbNode, "click", () => {
        if(!readOnly) {
          this.removeCrumbs(level);
          if(parent) {
            this._createSubCategoryMenu(parent, level - 1);
          } else {
            domClass.add(this.dropdown_node, "hide");
          }
        } else {
          this.removeCrumbs(level + 1);
          this._createSubCategoryMenu(category, level);
        }
      });
    },

    /**
     *
     * @param category
     * @param level
     * @private
     */
    _createSubCategoryMenu: function (category, level) {

      let subCategories = category.categories;
      let hasSubCategories = (subCategories && (subCategories.length > 0));

      domClass.add(this.dropdown_node, "hide");
      domClass.remove(this.dropdown_node, "is-active");
      domConstruct.empty(this.dropdown_menu);

      if(hasSubCategories && (level < this.maxDepth)) {
        domClass.remove(this.dropdown_node, "hide");

        subCategories.forEach((subCategory) => {
          let subCategoryNode = domConstruct.create("span", {
            className: "dropdown-link",
            role: "menu-item",
            innerHTML: subCategory.title
          }, this.dropdown_menu);
          on(subCategoryNode, "click", () => {
            this._createCrumbNode(category, subCategory, level + 1);
          });
        });

      }

      const queryParts = query("span.crumb", this.breadcrumbs_node).reduce((query, node) => {
        return query.concat(node.innerHTML);
      }, []);

      this.value = { path: `/${queryParts.join("/")}`, category: category };
      this.emit("change", this.value);
    },

    /**
     *
     */
    destroy: function () {
      domConstruct.empty(this.container);
    }

  });

  GroupCategoryCrumbs.version = "0.0.2";

  return GroupCategoryCrumbs;
});