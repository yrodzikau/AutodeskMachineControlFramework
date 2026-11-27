/*++

Copyright (C) 2021 Autodesk Inc.

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.
 * Neither the name of the Autodesk Inc. nor the
names of its contributors may be used to endorse or promote products
derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL AUTODESK INC. BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

 */


import * as Common from "../common/AMCCommon.js"


/*
	Image correction page module (server: CUIModule_ImageCorrection): the quadrilateral of an image that is corrected
	onto a rectangle of the platform, and a preview of the corrected image on the platform. All data comes as v2
	attributes:
	  platformuuid     sender of the apply event
	  sizex, sizey     platform size in mm, originx/originy the toolpath origin on the platform, as in the layer view
	  baseimageresource, dark_baseimageresource   image of the platform
	  applyevent       event of the Apply button; its parameters are the eight corner values
	  images           JSON {"images": [...]} set by the UI plugin, see imageCorrection.ts of the Svelte client
	  correction       JSON of the stored corners set by the UI plugin, "" for the corners of the image
	  menucaption, selectcaption, previewcaption, picturecaption, emptynote, errornote   texts of the page
	Only the Svelte client draws it.
*/
export default class AMCApplicationModule_ImageCorrection extends Common.AMCApplicationModule {

	constructor (page, moduleJSON)
	{
		super (page, moduleJSON.uuid, moduleJSON.type, moduleJSON.name || moduleJSON.uuid, moduleJSON.caption || "");
		this.registerClass ("amcModule_ImageCorrection");

		this.usesV2Frontend = true;

		this.platformuuid = Common.nullUUID ();
		this.sizex = 300.0;
		this.sizey = 300.0;
		this.originx = 0.0;
		this.originy = 0.0;
		this.baseimageresource = "";
		this.dark_baseimageresource = "";
		this.applyevent = "";
		this.images = "";
		this.correction = "";
		this.menucaption = "Image";
		this.selectcaption = "Image Area Select";
		this.previewcaption = "Image Preview";
		this.picturecaption = "Image";
		this.emptynote = "No images available";
		this.errornote = "Image could not be loaded";

		this.updateFromV2Attributes (moduleJSON.attributes || {});
	}


	updateFromV2Attributes (attrs)
	{
		if (!attrs)
			return true;

		if (attrs.caption !== undefined)
			this.caption = String (attrs.caption);
		if (attrs.visible !== undefined)
			this.visible = (attrs.visible === true || attrs.visible === 1 || attrs.visible === "1" || attrs.visible === "true");
		if (attrs.platformuuid !== undefined)
			this.platformuuid = String (attrs.platformuuid);
		for (let key of ["sizex", "sizey", "originx", "originy"]) {
			if (attrs[key] !== undefined) {
				let value = parseFloat (attrs[key]);
				if (!isNaN (value))
					this[key] = value;
			}
		}
		for (let key of ["baseimageresource", "dark_baseimageresource", "applyevent", "images", "correction",
			"menucaption", "selectcaption", "previewcaption", "picturecaption", "emptynote", "errornote"]) {
			if (attrs[key] !== undefined)
				this[key] = String (attrs[key]);
		}

		return true;
	}

}
