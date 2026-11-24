/*++

Copyright (C) 2026 Autodesk Inc.

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

#ifndef __AMCTEST_UNITTEST_SCATTERPLOTSLOTS
#define __AMCTEST_UNITTEST_SCATTERPLOTSLOTS

#include "amc_unittests.hpp"
#include "amc_unittests_libmcdata.hpp"
#include "amc_toolpathhandler.hpp"
#include "amc_scatterplot.hpp"
#include "common_utils.hpp"

#include <algorithm>
#include <cctype>
#include <memory>
#include <string>

namespace AMCUnitTest {

	// Scatterplot slots of the toolpath handler: a slot shows one scatterplot at a time, and a scatterplot that no
	// slot shows anymore is released.
	class CUnitTestGroup_ScatterplotSlots : public CUnitTestGroup {
	public:

		std::string getTestGroupName() override {
			return "ScatterplotSlots";
		}

		void registerTests() override {
			registerTest("ReplacedScatterplotIsReleased", "A slot that shows another scatterplot releases the one it showed before", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ScatterplotSlots::testReplacedScatterplotIsReleased, this));
			registerTest("ClearedSlotReleasesScatterplot", "The null UUID, an empty value and an unknown UUID empty a slot", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ScatterplotSlots::testClearedSlotReleasesScatterplot, this));
			registerTest("SharedScatterplotIsKept", "A scatterplot stays while another slot or owner still shows it", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ScatterplotSlots::testSharedScatterplotIsKept, this));
			registerTest("SameScatterplotAgain", "Putting a scatterplot into the slot it is in changes nothing", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ScatterplotSlots::testSameScatterplotAgain, this));
			registerTest("ScatterplotsWithoutSlotAreKept", "Scatterplots that never were in a slot are not released", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ScatterplotSlots::testScatterplotsWithoutSlotAreKept, this));
			registerTest("EndedOwnerReleasesItsSlots", "Releasing the slots of an owner releases the scatterplots only it showed", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ScatterplotSlots::testEndedOwnerReleasesItsSlots, this));
			registerTest("ReleasedScatterplotStaysValidForItsHolder", "A request that holds a scatterplot keeps it after its release", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ScatterplotSlots::testReleasedScatterplotStaysValidForItsHolder, this));
		}

		void initializeTests() override {
		}

	private:

		struct SFixture {
			LibMCData::PWrapper m_pDataWrapper;
			LibMCData::PDataModel m_pDataModel;
			AMC::PToolpathHandler m_pToolpathHandler;
		};

		SFixture createFixture(const std::string& sSuffix)
		{
			SFixture fixture;

			std::string sRootPath = "temp";
			if (!AMCCommon::CUtils::fileOrPathExistsOnDisk(sRootPath))
				AMCCommon::CUtils::createDirectoryOnDisk(sRootPath);

			std::string sBasePath = sRootPath + "/scatterplotslots_" + sSuffix + "_" + AMCCommon::CUtils::createUUID();
			if (!AMCCommon::CUtils::fileOrPathExistsOnDisk(sBasePath))
				AMCCommon::CUtils::createDirectoryOnDisk(sBasePath);

			fixture.m_pDataWrapper = AMCUnitTest::loadLibMCDataInProcess();
			fixture.m_pDataModel = fixture.m_pDataWrapper->CreateDataModelInstance();
			fixture.m_pDataModel->InitialiseDatabase(sBasePath, LibMCData::eDataBaseType::SqLite, sBasePath + "/storage.db");
			fixture.m_pToolpathHandler = std::make_shared<AMC::CToolpathHandler>(fixture.m_pDataModel);

			return fixture;
		}

		// Stores a scatterplot with one point and returns its UUID.
		std::string storeScatterplot(SFixture& fixture)
		{
			std::string sUUID = AMCCommon::CUtils::createUUID();
			auto pScatterplot = std::make_shared<AMC::CScatterplot>(sUUID);
			pScatterplot->getEntries().push_back({ 1.0, 2.0 });
			fixture.m_pToolpathHandler->storeScatterplot(pScatterplot);
			return sUUID;
		}

		bool isStored(SFixture& fixture, const std::string& sUUID)
		{
			return fixture.m_pToolpathHandler->restoreScatterplot(sUUID, false).get() != nullptr;
		}

		void testReplacedScatterplotIsReleased()
		{
			auto fixture = createFixture("replaced");
			auto pHandler = fixture.m_pToolpathHandler;
			std::string sFirst = storeScatterplot(fixture);
			std::string sSecond = storeScatterplot(fixture);
			std::string sThird = storeScatterplot(fixture);
			assertTrue(pHandler->getScatterplotCount() == 3, "three scatterplots stored");

			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sFirst);
			assertTrue(isStored(fixture, sFirst), "shown scatterplot is stored");

			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sSecond);
			assertFalse(isStored(fixture, sFirst), "replaced scatterplot is released");
			assertTrue(isStored(fixture, sSecond), "new scatterplot is stored");

			// The case of a UUID does not matter.
			std::string sThirdUpperCase = sThird;
			std::transform(sThirdUpperCase.begin(), sThirdUpperCase.end(), sThirdUpperCase.begin(), [](unsigned char ch) { return (char)std::toupper(ch); });
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sThirdUpperCase);
			assertFalse(isStored(fixture, sSecond), "scatterplot replaced by an upper case UUID is released");
			assertTrue(isStored(fixture, sThird), "scatterplot given in upper case is stored");
			assertTrue(pHandler->getScatterplotCount() == 1, "one scatterplot left");
		}

		void testClearedSlotReleasesScatterplot()
		{
			auto fixture = createFixture("cleared");
			auto pHandler = fixture.m_pToolpathHandler;

			std::string sFirst = storeScatterplot(fixture);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sFirst);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", AMCCommon::CUtils::createEmptyUUID());
			assertFalse(isStored(fixture, sFirst), "the null UUID releases the scatterplot");

			std::string sSecond = storeScatterplot(fixture);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sSecond);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", "");
			assertFalse(isStored(fixture, sSecond), "an empty value releases the scatterplot");

			std::string sThird = storeScatterplot(fixture);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sThird);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", AMCCommon::CUtils::createUUID());
			assertFalse(isStored(fixture, sThird), "a UUID that is no scatterplot releases the scatterplot");

			std::string sFourth = storeScatterplot(fixture);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sFourth);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", "not a uuid");
			assertFalse(isStored(fixture, sFourth), "a value that is no UUID releases the scatterplot");
			assertTrue(pHandler->getScatterplotCount() == 0, "no scatterplot left");

			// An empty slot can be emptied again.
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", "");
			pHandler->setScatterplotSlot("other session", "viewer.scatterplotuuid", AMCCommon::CUtils::createEmptyUUID());
			assertTrue(pHandler->getScatterplotCount() == 0, "still no scatterplot");
		}

		void testSharedScatterplotIsKept()
		{
			auto fixture = createFixture("shared");
			auto pHandler = fixture.m_pToolpathHandler;
			std::string sShared = storeScatterplot(fixture);
			std::string sOther = storeScatterplot(fixture);

			// Two slots of one owner.
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sShared);
			pHandler->setScatterplotSlot("session", "viewer.secondaryscatterplotuuid", sShared);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sOther);
			assertTrue(isStored(fixture, sShared), "scatterplot of the second slot is kept");

			// The scatterplot moves from one slot to the other one.
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sShared);
			assertFalse(isStored(fixture, sOther), "scatterplot that left its only slot is released");
			pHandler->setScatterplotSlot("session", "viewer.secondaryscatterplotuuid", "");
			assertTrue(isStored(fixture, sShared), "scatterplot of the first slot is kept");

			// The same slot of two owners.
			pHandler->setScatterplotSlot("other session", "viewer.scatterplotuuid", sShared);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", "");
			assertTrue(isStored(fixture, sShared), "scatterplot of the other owner is kept");
			pHandler->setScatterplotSlot("other session", "viewer.scatterplotuuid", "");
			assertFalse(isStored(fixture, sShared), "scatterplot without a slot is released");
		}

		void testSameScatterplotAgain()
		{
			auto fixture = createFixture("again");
			auto pHandler = fixture.m_pToolpathHandler;
			std::string sFirst = storeScatterplot(fixture);
			std::string sSecond = storeScatterplot(fixture);

			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sFirst);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sFirst);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sFirst);
			assertTrue(isStored(fixture, sFirst), "scatterplot is kept");

			// It was counted once, so one replacement releases it.
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sSecond);
			assertFalse(isStored(fixture, sFirst), "scatterplot is released by one replacement");
		}

		void testScatterplotsWithoutSlotAreKept()
		{
			auto fixture = createFixture("withoutslot");
			auto pHandler = fixture.m_pToolpathHandler;
			std::string sNeverShown = storeScatterplot(fixture);
			std::string sShown = storeScatterplot(fixture);

			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sShown);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", "");
			pHandler->releaseScatterplotSlots("session");
			pHandler->releaseScatterplotSlots("unknown owner");

			assertTrue(isStored(fixture, sNeverShown), "scatterplot that never was in a slot is kept");
			assertFalse(isStored(fixture, sShown), "scatterplot that left its slot is released");
		}

		void testEndedOwnerReleasesItsSlots()
		{
			auto fixture = createFixture("owner");
			auto pHandler = fixture.m_pToolpathHandler;
			std::string sPrimary = storeScatterplot(fixture);
			std::string sSecondary = storeScatterplot(fixture);
			std::string sShared = storeScatterplot(fixture);
			std::string sOfOther = storeScatterplot(fixture);

			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sPrimary);
			pHandler->setScatterplotSlot("session", "viewer.secondaryscatterplotuuid", sSecondary);
			pHandler->setScatterplotSlot("session", "status.scatterplotuuid", sShared);
			pHandler->setScatterplotSlot("other session", "status.scatterplotuuid", sShared);
			pHandler->setScatterplotSlot("other session", "viewer.scatterplotuuid", sOfOther);

			pHandler->releaseScatterplotSlots("session");
			assertFalse(isStored(fixture, sPrimary), "scatterplot of the ended owner is released");
			assertFalse(isStored(fixture, sSecondary), "second scatterplot of the ended owner is released");
			assertTrue(isStored(fixture, sShared), "scatterplot that another owner shows is kept");
			assertTrue(isStored(fixture, sOfOther), "scatterplot of the other owner is kept");

			// The slots of the ended owner are gone: a new scatterplot in one of them replaces nothing.
			std::string sNew = storeScatterplot(fixture);
			pHandler->setScatterplotSlot("session", "status.scatterplotuuid", sNew);
			assertTrue(isStored(fixture, sShared), "scatterplot of the other owner is still kept");

			pHandler->releaseScatterplotSlots("other session");
			assertFalse(isStored(fixture, sShared), "shared scatterplot is released with its last owner");
			assertFalse(isStored(fixture, sOfOther), "scatterplot of the other owner is released with it");
			assertTrue(isStored(fixture, sNew), "scatterplot of the first owner is kept");
		}

		void testReleasedScatterplotStaysValidForItsHolder()
		{
			auto fixture = createFixture("holder");
			auto pHandler = fixture.m_pToolpathHandler;
			std::string sUUID = storeScatterplot(fixture);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", sUUID);

			// An API request that is being answered holds the scatterplot it looked up.
			auto pHeld = pHandler->restoreScatterplot(sUUID, true);
			pHandler->setScatterplotSlot("session", "viewer.scatterplotuuid", "");

			assertFalse(isStored(fixture, sUUID), "scatterplot is released");
			assertTrue(pHeld->getEntryCount() == 1, "held scatterplot keeps its points");
			assertTrue(pHeld->getUUID() == sUUID, "held scatterplot keeps its UUID");
		}

	};

}

#endif // __AMCTEST_UNITTEST_SCATTERPLOTSLOTS
