// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Panel, PanelLayout, TabBar, Widget } from '@lumino/widgets';
import { ReadonlyJSONObject, PromiseDelegate } from '@lumino/coreutils';
import { Signal } from '@lumino/signaling';
import {
  BasicKeyHandler,
  BasicMouseHandler,
  BasicSelectionModel,
  DataGrid,
  JSONModel
} from '@lumino/datagrid';

import { VirtualElement, h } from '@lumino/virtualdom';

import { ServerConnection } from '@jupyterlab/services';
import { TranslationBundle } from '@jupyterlab/translation';

/**
 * A license viewer
 */
export class Licenses extends Panel {
  protected readonly model: Licenses.Model;
  constructor(options: Licenses.IOptions) {
    super();
    this.addClass('jp-Licenses');
    this.model = options.model;
    this.initTabs();
    this.initGrid();
    this.model.licensesChanged.connect(this.onLicensesChanged, this);
    void this.model.initLicenses();
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }
    super.dispose();
  }

  protected initTabs() {
    const layout = this.layout as PanelLayout;
    this._tabs = new TabBar({
      orientation: 'vertical',
      renderer: new Licenses.BundleTabRenderer(this.model)
    });
    this._tabs.addClass('jp-Licenses-Bundles');
    layout.addWidget(this._tabs);
    this._tabs.currentChanged.connect(this.onBundleSelected, this);
  }

  protected initGrid() {
    const layout = this.layout as PanelLayout;
    this._grid = new DataGrid({
      defaultSizes: {
        rowHeight: 24,
        columnWidth: 144,
        rowHeaderWidth: 64,
        columnHeaderHeight: 36
      },
      stretchLastColumn: true,
      stretchLastRow: true
    });
    this._grid.addClass('jp-Licenses-Grid');
    this._grid.headerVisibility = 'all';
    this._grid.keyHandler = new BasicKeyHandler();
    this._grid.mouseHandler = new BasicMouseHandler();
    this._grid.copyConfig = {
      separator: '\t',
      format: DataGrid.copyFormatGeneric,
      headers: 'all',
      warningThreshold: 1e6
    };

    layout.addWidget(this._grid);
  }

  protected onBundleSelected() {
    if (this._tabs.currentTitle?.label) {
      this.model.bundle = this._tabs.currentTitle.label;
    }
    this._updateGrid();
  }

  protected onLicensesChanged() {
    this._updateTabs();
    this._updateGrid();
  }

  protected _updateTabs(): void {
    this._tabs.clearTabs();
    let i = 0;
    for (const bundle of this.model.bundles) {
      const tab = new Widget();
      tab.title.label = bundle;
      this._tabs.insertTab(++i, tab.title);
    }
  }

  /**
   * Create the model for the grid.
   */
  protected _updateGrid(): void {
    const licenses = this.model.licenses;
    const bundle = this.model.bundle;
    const data = licenses && bundle ? licenses[bundle]?.packages : [];
    const dataModel = (this._grid.dataModel = new JSONModel({
      data,
      schema: this.model.schema
    }));
    this._grid.selectionModel = new BasicSelectionModel({ dataModel });
  }

  protected _grid: DataGrid;
  protected _tabs: TabBar<Widget>;
}

export namespace Licenses {
  /**
   * Options for instantiating a license viewer
   */
  export interface IOptions {
    model: Model;
  }
  /**
   * Options for instantiating a license model
   */
  export interface IModelOptions {
    licensesUrl: string;
    serverSettings?: ServerConnection.ISettings;
    trans: TranslationBundle;
  }

  /**
   * The JSON response from the API
   */
  export interface ILicenseResponse {
    [key: string]: ILicenseReport;
  }

  /**
   * A top-level report of the licenses for all code included in a bundle
   *
   * ### Note
   *
   * This is roughly informed by the terms defined in the SPDX spec, though is not
   * an SPDX Document, since there seem to be several (incompatible) specs
   * in that repo.
   *
   * @see https://github.com/spdx/spdx-spec/blob/development/v2.2.1/schemas/spdx-schema.json
   **/
  export interface ILicenseReport extends ReadonlyJSONObject {
    packages: IPackageLicenseInfo[];
  }

  /**
   * A best-effort single bundled package's information.
   *
   * ### Note
   *
   * This is roughly informed by SPDX `packages` and `hasExtractedLicenseInfos`,
   * as making it conformant would vastly complicate the structure.
   *
   * @see https://github.com/spdx/spdx-spec/blob/development/v2.2.1/schemas/spdx-schema.json
   **/
  export interface IPackageLicenseInfo extends ReadonlyJSONObject {
    /** the name of the package as it appears in node_modules */
    name: string;
    /** the version of the package, or an empty string if unknown */
    versionInfo: string;
    /** an SPDX license or LicenseRef, or an empty string if unknown */
    licenseId: string;
    /** the verbatim extracted text of the license, or an empty string if unknown */
    extractedText: string;
  }

  /**
   * A model for license data
   */
  export class Model {
    constructor(options: IModelOptions) {
      this._trans = options.trans;
      this._licensesUrl = options.licensesUrl;
      this._serverSettings =
        options.serverSettings || ServerConnection.makeSettings();
      this._licensesChanged = new Signal(this);
      this.initSchema();
    }

    async initLicenses() {
      const response = await ServerConnection.makeRequest(
        this._licensesUrl,
        {},
        this._serverSettings
      );
      this._licenses = await response.json();
      this._licensesReady.resolve(void 0);
      this._licensesChanged.emit(void 0);
    }

    protected initSchema() {
      this._schema = {
        fields: [
          { name: 'name', title: this._trans.__('Name') },
          { name: 'versionInfo', title: this._trans.__('Version') },
          { name: 'licenseId', title: this._trans.__('License ID') },
          { name: 'extractedText', title: this._trans.__('License Text') }
        ]
      };
    }

    get licensesChanged() {
      return this._licensesChanged;
    }

    get schema() {
      return this._schema;
    }

    get bundles(): string[] {
      if (this._licenses) {
        return Object.keys(this._licenses);
      }
      return [];
    }

    get bundle() {
      if (this._bundle) {
        return this._bundle;
      }
      if (this.bundles.length) {
        return this.bundles[0];
      }
      return null;
    }

    set bundle(bundle: string | null) {
      this._bundle = bundle;
    }

    get licenses() {
      return this._licenses;
    }

    get licensesReady() {
      return this._licensesReady.promise;
    }

    private _licensesChanged: Signal<Model, void>;
    private _licenses: ILicenseResponse | null;
    private _licensesUrl: string;
    private _serverSettings: ServerConnection.ISettings;
    private _bundle: string | null;
    private _trans: TranslationBundle;
    private _schema: JSONModel.Schema;
    private _licensesReady = new PromiseDelegate<void>();
  }

  export class BundleTabRenderer extends TabBar.Renderer {
    model: Model;

    readonly closeIconSelector = '.lm-TabBar-tabCloseIcon';
    constructor(model: Model) {
      super();
      this.model = model;
    }
    renderTab(data: TabBar.IRenderData<Widget>): VirtualElement {
      let title = data.title.caption;
      let key = this.createTabKey(data);
      let style = this.createTabStyle(data);
      let className = this.createTabClass(data);
      let dataset = this.createTabDataset(data);
      return h.li(
        { key, className, title, style, dataset },
        this.renderIcon(data),
        this.renderLabel(data),
        this.renderCountBadge(data)
      );
    }

    renderCountBadge(data: TabBar.IRenderData<Widget>): VirtualElement {
      const bundle = data.title.label;
      const { licenses } = this.model;
      const packages =
        (licenses && bundle ? licenses[bundle].packages : []) || [];
      return h.label({}, `${packages.length}`);
    }
  }
}
