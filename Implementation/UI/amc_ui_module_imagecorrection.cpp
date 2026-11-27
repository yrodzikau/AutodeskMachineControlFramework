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


#define __AMCIMPL_UI_MODULE
#define __AMCIMPL_API_CONSTANTS

#include "amc_ui_module.hpp"
#include "amc_ui_module_item.hpp"
#include "amc_ui_modulefactory.hpp"

#include "amc_ui_module_imagecorrection.hpp"

#include "amc_api_constants.hpp"
#include "amc_resourcepackage.hpp"
#include "amc_parameterhandler.hpp"

#include "common_utils.hpp"

#include "libmc_exceptiontypes.hpp"

using namespace AMC;


// The frontend loads platform images via /image/{uuid}, so the resource name of config.xml is resolved to the UUID of
// its resource package entry, like the layer view does. Returns an empty string for an empty name.
static std::string resolveImageCorrectionResourceUUID(PUIModuleEnvironment pUIModuleEnvironment, CUIExpression& imageExpression)
{
	std::string sResourceName = imageExpression.evaluateStringValue(pUIModuleEnvironment->stateMachineData());
	if (sResourceName.empty())
		return "";

	auto pResourceEntry = pUIModuleEnvironment->resourcePackage()->findEntryByName(sResourceName, true);
	return pResourceEntry->getUUID();
}


CUIModule_ImageCorrectionItem::CUIModule_ImageCorrectionItem(const std::string& sItemPath)
	: CUIModuleItem(sItemPath), m_sUUID(AMCCommon::CUtils::createUUID())
{
}

std::string CUIModule_ImageCorrectionItem::getUUID()
{
	return m_sUUID;
}

std::string CUIModule_ImageCorrectionItem::findElementPathByUUID(const std::string& sUUID)
{
	if (sUUID == getUUID())
		return getItemPath();

	return "";
}

void CUIModule_ImageCorrectionItem::populateClientVariables(CParameterHandler* pClientVariableHandler)
{
	LibMCAssertNotNull(pClientVariableHandler);

	// Set by the UI plugin with SetUIProperty, see the header. The frontend state reports these values instead of the
	// fixed empty attributes of the module.
	auto pGroup = pClientVariableHandler->addGroup(getItemPath(), "image correction");
	pGroup->addNewStringParameter(AMC_API_KEY_UI_IMAGECORRECTIONIMAGES, "Images to choose from (JSON)", "");
	pGroup->addNewStringParameter(AMC_API_KEY_UI_IMAGECORRECTION, "Stored corners of the corrected area (JSON)", "");
}


CUIModule_ImageCorrection::CUIModule_ImageCorrection(pugi::xml_node& xmlNode, const std::string& sPath, PUIModuleEnvironment pUIModuleEnvironment)
	: CUIModule(getNameFromXML(xmlNode), getStaticType(), sPath, pUIModuleEnvironment->getFrontendDefinition())
{
	LibMCAssertNotNull(pUIModuleEnvironment.get());
	if (getTypeFromXML(xmlNode) != getStaticType())
		throw ELibMCInterfaceException(LIBMC_ERROR_INVALIDMODULETYPE, "should be " + getStaticType());

	if (sPath.empty())
		throw ELibMCCustomException(LIBMC_ERROR_INVALIDMODULEPATH, m_sName);

	m_sModulePath = sPath + "." + m_sName;

	auto platformNode = xmlNode.child("platform");
	if (platformNode.empty())
		throw ELibMCCustomException(LIBMC_ERROR_PLATFORMINFORMATIONMISSING, m_sName);

	// The platform as the layer view declares it: sizex x sizey mm, the toolpath origin at (originx, originy) of it.
	CUIExpression sizeX(platformNode, "sizex");
	CUIExpression sizeY(platformNode, "sizey");
	CUIExpression originX(platformNode, "originx");
	CUIExpression originY(platformNode, "originy");
	CUIExpression baseImage(platformNode, "baseimage");
	CUIExpression darkBaseImage(platformNode, "dark_baseimage", false);
	CUIExpression applyEvent(xmlNode, AMC_API_KEY_UI_APPLYEVENT);

	m_Item = std::make_shared<CUIModule_ImageCorrectionItem>(m_sModulePath);

	registerNumberAttribute(AMC_API_KEY_UI_SIZEX, sizeX);
	registerNumberAttribute(AMC_API_KEY_UI_SIZEY, sizeY);
	registerNumberAttribute(AMC_API_KEY_UI_ORIGINX, originX);
	registerNumberAttribute(AMC_API_KEY_UI_ORIGINY, originY);
	registerStringAttribute(AMC_API_KEY_UI_APPLYEVENT, applyEvent);

	// /image/{uuid} needs the UUID of the resource, resolved once at startup.
	CUIExpression baseImageUUIDExpression;
	std::string sBaseImageResourceUUID = resolveImageCorrectionResourceUUID(pUIModuleEnvironment, baseImage);
	baseImageUUIDExpression.setFixedValue(sBaseImageResourceUUID.empty() ? AMCCommon::CUtils::createEmptyUUID() : sBaseImageResourceUUID);
	registerStringAttribute(AMC_API_KEY_UI_BASEIMAGERESOURCE, baseImageUUIDExpression);

	// An empty value (not the null UUID) means "no dark image", the client falls back to the light one.
	CUIExpression darkBaseImageUUIDExpression;
	darkBaseImageUUIDExpression.setFixedValue(resolveImageCorrectionResourceUUID(pUIModuleEnvironment, darkBaseImage));
	registerStringAttribute("dark_baseimageresource", darkBaseImageUUIDExpression);

	// The images and the stored corners have no XML attribute: the UI plugin sets the client variables of the same
	// names. Registered with fixed empty values, so that the frontend state reports the client values.
	CUIExpression pluginDeclarationExpression;
	pluginDeclarationExpression.setFixedValue("");
	registerStringAttribute(AMC_API_KEY_UI_IMAGECORRECTIONIMAGES, pluginDeclarationExpression);
	registerStringAttribute(AMC_API_KEY_UI_IMAGECORRECTION, pluginDeclarationExpression);

	// The client sends the apply event with the item as its sender.
	CUIExpression itemUUIDExpression;
	itemUUIDExpression.setFixedValue(m_Item->getUUID());
	registerStringAttribute(AMC_API_KEY_UI_PLATFORMUUID, itemUUIDExpression);

	// Texts of the page: the caption of the menu of images, the titles of the two views and of the opacity panel, and
	// the notes shown instead of an image.
	registerStringAttribute("menucaption", CUIExpression(xmlNode, "menucaption", "Image"));
	registerStringAttribute("selectcaption", CUIExpression(xmlNode, "selectcaption", "Image Area Select"));
	registerStringAttribute("previewcaption", CUIExpression(xmlNode, "previewcaption", "Image Preview"));
	registerStringAttribute("picturecaption", CUIExpression(xmlNode, "picturecaption", "Image"));
	registerStringAttribute("emptynote", CUIExpression(xmlNode, "emptynote", "No images available"));
	registerStringAttribute("errornote", CUIExpression(xmlNode, "errornote", "Image could not be loaded"));

	m_sCaption = xmlNode.attribute("caption").as_string();
	CUIExpression captionExpression;
	captionExpression.setFixedValue(m_sCaption);
	registerStringAttribute("caption", captionExpression);

	CUIExpression visibleExpression(xmlNode, "visible", "1");
	registerBoolAttribute("visible", visibleExpression);
}


CUIModule_ImageCorrection::~CUIModule_ImageCorrection()
{
}

std::string CUIModule_ImageCorrection::getStaticType()
{
	return "imagecorrection";
}

std::string CUIModule_ImageCorrection::getType()
{
	return getStaticType();
}

std::string CUIModule_ImageCorrection::getCaption()
{
	return m_sCaption;
}

void CUIModule_ImageCorrection::populateModuleMap(std::map<std::string, PUIModule>& moduleMap)
{
	moduleMap.insert(std::make_pair(m_sUUID, std::make_shared<CUIModule_ImageCorrection>(*this)));
}

void CUIModule_ImageCorrection::populateLegacyItemMap(std::map<std::string, PUIModuleItem>& itemMap)
{
	itemMap.insert(std::make_pair(m_Item->getUUID(), m_Item));
}

PUIModuleItem CUIModule_ImageCorrection::findLegacyItem(const std::string& sUUID)
{
	if (m_Item->getUUID() == sUUID)
		return m_Item;

	return nullptr;
}

void CUIModule_ImageCorrection::populateLegacyClientVariables(CParameterHandler* pParameterHandler)
{
	LibMCAssertNotNull(pParameterHandler);
	m_Item->populateClientVariables(pParameterHandler);
}

bool CUIModule_ImageCorrection::isVersion2FrontendModule()
{
	return true;
}
