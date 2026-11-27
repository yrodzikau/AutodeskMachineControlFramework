/*++

Copyright (C) 2020 Autodesk Inc.

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


#ifndef __AMC_UI_MODULE_IMAGECORRECTION
#define __AMC_UI_MODULE_IMAGECORRECTION

#include "header_protection.hpp"

#ifndef __AMCIMPL_UI_MODULE
#error this header is protected and should only be included in the corresponding implementation CPP files.
#endif

#include "Libraries/PugiXML/pugixml.hpp"
#include <string>
#include "amc_ui_expression.hpp"

namespace AMC {

	amcDeclareDependingClass(CUIModule, PUIModule);
	amcDeclareDependingClass(CUIModule_ImageCorrection, PUIModule_ImageCorrection);
	amcDeclareDependingClass(CUIModule_ImageCorrectionItem, PUIModule_ImageCorrectionItem);
	amcDeclareDependingClass(CUIModuleItem, PUIModuleItem);
	amcDeclareDependingClass(CParameterHandler, PParameterHandler);

	/*
		Image correction page module: selects the quadrilateral of an image (for example the build plate in a camera
		image) whose perspective is corrected onto a rectangle of the platform, and previews the corrected image on the
		platform like the picture overlay of the layer view draws it (Svelte client only).

		Markup:
		  <imagecorrection name="..." caption="..." applyevent="..." menucaption="..." selectcaption="..."
		                   previewcaption="..." picturecaption="..." emptynote="..." errornote="...">
		    <platform sizex="300" sizey="300" originx="150" originy="150" baseimage="buildplate" dark_baseimage="..."/>
		  </imagecorrection>

		The platform attributes are the ones of the layer view. The optional texts name the menu of images, the view
		that selects the quadrilateral, the preview, the opacity panel of the preview, and say that there is no image or
		that it could not be loaded. A UI plugin sets the per-session client variables of the
		module with UIEnvironment::SetUIProperty (path page.module):
		  images      JSON {"images": [...]}: the images to choose from, each with caption, timestamp (ISO 8601 UTC,
		              optional), imageuuid (storage stream served by /api/image) and the area of the platform the image
		              is corrected onto (sizex, sizey, originx, originy in toolpath coordinates, mm); the client
		              documents the members. "" or no entries: nothing to choose.
		  correction  JSON with the stored corners as fractions of the image width and height from its top left corner:
		              topleftx, toplefty, toprightx, toprighty, bottomrightx, bottomrighty, bottomleftx, bottomlefty.
		              "": the corners of the image.
		Apply triggers applyevent with the module item (platformuuid) as sender and the eight values as event
		parameters of the same names.
	*/
	class CUIModule_ImageCorrectionItem : public CUIModuleItem {
	private:
		std::string m_sUUID;

	public:

		CUIModule_ImageCorrectionItem(const std::string& sItemPath);

		virtual std::string getUUID() override;

		virtual std::string findElementPathByUUID(const std::string& sUUID) override;

		void populateClientVariables(CParameterHandler* pClientVariableHandler);
	};


	class CUIModule_ImageCorrection : public CUIModule {
	protected:

		std::string m_sCaption;

		PUIModule_ImageCorrectionItem m_Item;

	public:

		CUIModule_ImageCorrection(pugi::xml_node& xmlNode, const std::string& sPath, PUIModuleEnvironment pUIModuleEnvironment);

		virtual ~CUIModule_ImageCorrection();

		virtual std::string getType() override;

		static std::string getStaticType();

		std::string getCaption() override;

		virtual void populateModuleMap(std::map<std::string, PUIModule>& moduleMap) override;

		virtual void populateLegacyItemMap(std::map<std::string, PUIModuleItem>& itemMap) override;

		virtual PUIModuleItem findLegacyItem(const std::string& sUUID) override;

		virtual void populateLegacyClientVariables(CParameterHandler* pParameterHandler) override;

		bool isVersion2FrontendModule() override;

	};

}


#endif //__AMC_UI_MODULE_IMAGECORRECTION
