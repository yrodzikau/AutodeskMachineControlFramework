/*++

Copyright (C) 2025 Autodesk Inc.

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

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS 'AS IS' AND
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

#ifndef __AMCTEST_UNITTEST_LIBMCDATA_EXECUTIONDELETION
#define __AMCTEST_UNITTEST_LIBMCDATA_EXECUTIONDELETION

#include "amc_unittests.hpp"
#include "amc_unittests_libmcdata.hpp"
#include "common_utils.hpp"
#include "libmcdata_dynamic.hpp"
#include "sqlite3.h"

#include <chrono>
#include <cstdint>
#include <fstream>
#include <string>
#include <vector>

namespace AMCUnitTest {

	// Tests of BuildJobExecution::DeleteExecution: an execution is deleted with its data attachments, metadata,
	// data captures and storage streams, and stays visible as a removed row for the execution list.
	class CUnitTestGroup_LibMCData_ExecutionDeletion : public CUnitTestGroup {
	public:
		std::string getTestGroupName() override {
			return "LibMCData_ExecutionDeletion";
		}

		void registerTests() override {
			registerTest("DeleteExecution", "An execution is deleted with attachments, metadata, captures and streams; other executions stay", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_LibMCData_ExecutionDeletion::testDeleteExecution, this));
			registerTest("RecordingCapture", "A capture that is still recording blocks the deletion unless it is aborted with it", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_LibMCData_ExecutionDeletion::testRecordingCapture, this));
			registerTest("RemovedList", "A deleted execution is reported as removed and leaves the lists and counters", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_LibMCData_ExecutionDeletion::testRemovedList, this));
			registerTest("ResumableDeletion", "A stream that is in use fails the deletion, a second call completes it", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_LibMCData_ExecutionDeletion::testResumableDeletion, this));
		}

		void initializeTests() override {
		}

	private:

		struct SFixture {
			LibMCData::PWrapper m_pDataWrapper;
			LibMCData::PDataModel m_pDataModel;
			LibMCData::PBuildJobHandler m_pBuildJobHandler;
			LibMCData::PStorage m_pStorage;
			LibMCData::PLoginHandler m_pLoginHandler;
			LibMCData::PBuildJob m_pJob;
			std::string m_sBasePath;
			std::string m_sDatabaseFile;
			std::string m_sUserUUID;
		};

		// What an execution of a test consists of.
		struct SExecutionContent {
			LibMCData::PBuildJobExecution m_pExecution;
			std::string m_sUUID;
			std::vector<std::string> m_AttachmentStreams;
			std::vector<std::string> m_SegmentStreams;
		};

		uint64_t getCurrentTimestamp()
		{
			return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
				std::chrono::system_clock::now().time_since_epoch()).count());
		}

		SFixture createFixture(const std::string& sSuffix)
		{
			SFixture fixture;

			std::string sRootPath = "temp";
			if (!AMCCommon::CUtils::fileOrPathExistsOnDisk(sRootPath))
				AMCCommon::CUtils::createDirectoryOnDisk(sRootPath);

			fixture.m_sBasePath = sRootPath + "/libmcdata_executiondeletion_" + sSuffix + "_" + AMCCommon::CUtils::createUUID();
			if (!AMCCommon::CUtils::fileOrPathExistsOnDisk(fixture.m_sBasePath))
				AMCCommon::CUtils::createDirectoryOnDisk(fixture.m_sBasePath);

			fixture.m_sDatabaseFile = fixture.m_sBasePath + "/executiondeletion.db";

			fixture.m_pDataWrapper = AMCUnitTest::loadLibMCDataInProcess();
			fixture.m_pDataModel = fixture.m_pDataWrapper->CreateDataModelInstance();
			fixture.m_pDataModel->InitialiseDatabase(fixture.m_sBasePath, LibMCData::eDataBaseType::SqLite, fixture.m_sDatabaseFile);
			fixture.m_pBuildJobHandler = fixture.m_pDataModel->CreateBuildJobHandler();
			fixture.m_pStorage = fixture.m_pDataModel->CreateStorage();
			fixture.m_pLoginHandler = fixture.m_pDataModel->CreateLoginHandler();

			std::string sSalt = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
			std::string sHash = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
			fixture.m_sUserUUID = fixture.m_pLoginHandler->CreateUser("testuser", "operator", sSalt, sHash, "Test User");

			std::string sContent = "job content";
			std::vector<uint8_t> buffer(sContent.begin(), sContent.end());
			std::string sStreamUUID = AMCCommon::CUtils::createUUID();
			fixture.m_pStorage->StoreNewStream(sStreamUUID, "job.bin", "application/octet-stream", buffer, fixture.m_sUserUUID, getCurrentTimestamp());

			fixture.m_pJob = fixture.m_pBuildJobHandler->CreateJob(AMCCommon::CUtils::createUUID(), "Deletion Job", fixture.m_sUserUUID, sStreamUUID, getCurrentTimestamp());
			fixture.m_pJob->StartValidating();
			fixture.m_pJob->FinishValidating(10);

			return fixture;
		}

		std::string streamPath(SFixture& fixture, const std::string& sStreamUUID)
		{
			return fixture.m_sBasePath + "/" + AMCCommon::CUtils::normalizeUUIDString(sStreamUUID) + ".stream";
		}

		bool streamFileExists(SFixture& fixture, const std::string& sStreamUUID)
		{
			return AMCCommon::CUtils::fileOrPathExistsOnDisk(streamPath(fixture, sStreamUUID));
		}

		std::string createSegmentStream(SFixture& fixture, size_t nSize)
		{
			std::string sUUID = AMCCommon::CUtils::createUUID();
			std::vector<uint8_t> buffer(nSize, 0x5A);

			fixture.m_pStorage->BeginRandomWriteStream(sUUID, "segment", "application/amcf-datatable", fixture.m_sUserUUID, getCurrentTimestamp());
			fixture.m_pStorage->StoreRandomWriteStream(sUUID, 0, buffer);
			fixture.m_pStorage->FinishRandomWriteStream(sUUID);

			return sUUID;
		}

		// An execution with nAttachments data attachments, two metadata strings and, with nSegments > 0, a
		// capture with that many stored segments. The capture is left recording unless bFinishCapture is set.
		SExecutionContent createExecution(SFixture& fixture, const std::string& sName, uint32_t nAttachments, uint32_t nSegments, bool bFinishCapture)
		{
			SExecutionContent content;
			content.m_pExecution = fixture.m_pJob->CreateBuildJobExecution(sName, fixture.m_sUserUUID, getCurrentTimestamp());
			content.m_sUUID = content.m_pExecution->GetExecutionUUID();

			for (uint32_t nIndex = 0; nIndex < nAttachments; nIndex++) {
				std::string sContent = sName + " attachment " + std::to_string(nIndex);
				std::vector<uint8_t> buffer(sContent.begin(), sContent.end());
				std::string sStreamUUID = AMCCommon::CUtils::createUUID();
				fixture.m_pStorage->StoreNewStream(sStreamUUID, "smcdatalayer" + std::to_string(nIndex), "application/amcf-datatable", buffer, fixture.m_sUserUUID, getCurrentTimestamp());

				auto pStream = fixture.m_pStorage->RetrieveStream(sStreamUUID);
				content.m_pExecution->AddJobExecutionData("smcdatalayer" + std::to_string(nIndex), "SMC Data Layer " + std::to_string(nIndex), pStream, LibMCData::eCustomDataType::CustomBinaryData, fixture.m_sUserUUID, getCurrentTimestamp());
				content.m_AttachmentStreams.push_back(sStreamUUID);
			}

			content.m_pExecution->StoreMetaDataString("controlmode", "rtc", getCurrentTimestamp());
			content.m_pExecution->StoreMetaDataString("smc_jobcharacteristic_layer0_duration", "1.500000", getCurrentTimestamp());

			if (nSegments > 0) {
				auto pCapture = content.m_pExecution->CreateDataCapture("rtcrecording", "RTC Recording", fixture.m_sUserUUID, getCurrentTimestamp());
				pCapture->AddColumn(0, "layer", "Layer Index", 4);
				pCapture->AddColumn(1, "x", "Target X", 1);

				uint64_t nTime = getCurrentTimestamp();
				for (uint32_t nIndex = 0; nIndex < nSegments; nIndex++) {
					std::string sStreamUUID = createSegmentStream(fixture, 500 + nIndex);
					pCapture->AddSegment(nIndex, sStreamUUID, (uint64_t)nIndex * 100, 100, 1, 500 + nIndex, nTime + nIndex, nTime + nIndex + 1);
					content.m_SegmentStreams.push_back(sStreamUUID);
				}

				if (bFinishCapture)
					pCapture->Finish(getCurrentTimestamp());
			}

			return content;
		}

		template <typename F>
		int32_t errorCodeOf(F&& fn, std::string* pMessage = nullptr)
		{
			try {
				fn();
			}
			catch (LibMCData::ELibMCDataException& dataException) {
				if (pMessage != nullptr)
					*pMessage = dataException.what();
				return dataException.getErrorCode();
			}
			return 0;
		}

		// Counts the rows of a query through a second, read-only connection to the database of the fixture.
		// The query has one parameter, a string.
		int64_t countRows(SFixture& fixture, const std::string& sCountQuery, const std::string& sParameter)
		{
			sqlite3* pDatabase = nullptr;
			int nResult = sqlite3_open_v2(fixture.m_sDatabaseFile.c_str(), &pDatabase, SQLITE_OPEN_READONLY, nullptr);
			assertTrue(nResult == SQLITE_OK, "The database of the fixture can be opened read-only");

			int64_t nCount = -1;
			sqlite3_stmt* pStatement = nullptr;
			if (sqlite3_prepare_v2(pDatabase, sCountQuery.c_str(), -1, &pStatement, nullptr) == SQLITE_OK) {
				sqlite3_bind_text(pStatement, 1, sParameter.c_str(), -1, SQLITE_TRANSIENT);
				if (sqlite3_step(pStatement) == SQLITE_ROW)
					nCount = sqlite3_column_int64(pStatement, 0);
			}
			sqlite3_finalize(pStatement);
			sqlite3_close(pDatabase);

			assertTrue(nCount >= 0, "The count query can be executed: " + sCountQuery);
			return nCount;
		}

		bool listContains(const std::string& sCommaSeparatedUUIDs, const std::string& sUUID)
		{
			std::vector<std::string> uuids;
			AMCCommon::CUtils::splitString(sCommaSeparatedUUIDs, ",", uuids);
			for (auto& sEntry : uuids) {
				if (!sEntry.empty() && (AMCCommon::CUtils::normalizeUUIDString(sEntry) == AMCCommon::CUtils::normalizeUUIDString(sUUID)))
					return true;
			}
			return false;
		}

		bool executionExists(SFixture& fixture, const std::string& sExecutionUUID)
		{
			return errorCodeOf([&]() { fixture.m_pBuildJobHandler->RetrieveJobExecution(sExecutionUUID); }) == 0;
		}

		// Asserts that nothing of the execution is left but its row, which is the marker of the deletion.
		void assertExecutionIsGone(SFixture& fixture, SExecutionContent& content, const std::string& sContext)
		{
			assertFalse(executionExists(fixture, content.m_sUUID), sContext + ": the execution can not be retrieved");

			for (auto& sStreamUUID : content.m_AttachmentStreams) {
				assertFalse(streamFileExists(fixture, sStreamUUID), sContext + ": the file of an attachment stream is deleted");
				assertTrue(countRows(fixture, "SELECT COUNT(*) FROM storage_streams WHERE uuid=?", AMCCommon::CUtils::normalizeUUIDString(sStreamUUID)) == 0, sContext + ": the attachment stream is deleted");
			}
			for (auto& sStreamUUID : content.m_SegmentStreams) {
				assertFalse(streamFileExists(fixture, sStreamUUID), sContext + ": the file of a capture segment is deleted");
				assertTrue(countRows(fixture, "SELECT COUNT(*) FROM storage_streams WHERE uuid=?", AMCCommon::CUtils::normalizeUUIDString(sStreamUUID)) == 0, sContext + ": the segment stream is deleted");
			}

			assertTrue(countRows(fixture, "SELECT COUNT(*) FROM buildjobexecutiondata WHERE executionuuid=?", content.m_sUUID) == 0, sContext + ": no attachment rows are left");
			assertTrue(countRows(fixture, "SELECT COUNT(*) FROM buildjobexecutionmetadata WHERE executionuuid=?", content.m_sUUID) == 0, sContext + ": no metadata rows are left");
			assertTrue(countRows(fixture, "SELECT COUNT(*) FROM datacaptures WHERE executionuuid=?", content.m_sUUID) == 0, sContext + ": no capture rows are left");
			assertTrue(countRows(fixture, "SELECT COUNT(*) FROM buildjobexecutions WHERE active=1 AND uuid=?", content.m_sUUID) == 0, sContext + ": the execution is not active");
			assertTrue(countRows(fixture, "SELECT COUNT(*) FROM buildjobexecutions WHERE active=0 AND uuid=?", content.m_sUUID) == 1, sContext + ": the row of the execution stays as the marker of its deletion");
		}

		void assertExecutionIsIntact(SFixture& fixture, SExecutionContent& content, const std::string& sContext)
		{
			assertTrue(executionExists(fixture, content.m_sUUID), sContext + ": the execution can be retrieved");

			for (auto& sStreamUUID : content.m_AttachmentStreams) {
				assertTrue(streamFileExists(fixture, sStreamUUID), sContext + ": the file of an attachment stream exists");
				assertTrue(fixture.m_pStorage->StreamIsReady(sStreamUUID), sContext + ": the attachment stream is ready");
			}
			for (auto& sStreamUUID : content.m_SegmentStreams)
				assertTrue(streamFileExists(fixture, sStreamUUID), sContext + ": the file of a capture segment exists");

			assertTrue(countRows(fixture, "SELECT COUNT(*) FROM buildjobexecutiondata WHERE executionuuid=?", content.m_sUUID) == (int64_t)content.m_AttachmentStreams.size(), sContext + ": the attachment rows are there");
			assertTrue(countRows(fixture, "SELECT COUNT(*) FROM buildjobexecutionmetadata WHERE executionuuid=?", content.m_sUUID) == 2, sContext + ": the metadata rows are there");
			assertTrue(content.m_pExecution->HasMetaDataString("controlmode"), sContext + ": the metadata is readable");
			if (!content.m_SegmentStreams.empty()) {
				assertTrue(content.m_pExecution->HasDataCapture("rtcrecording"), sContext + ": the capture is there");
				assertTrue(content.m_pExecution->RetrieveDataCapture("rtcrecording")->GetSegmentCount() == content.m_SegmentStreams.size(), sContext + ": the capture has its segments");
			}
		}

		void testDeleteExecution()
		{
			auto fixture = createFixture("delete");

			auto deleted = createExecution(fixture, "Deleted", 2, 2, true);
			auto kept = createExecution(fixture, "Kept", 1, 1, true);

			assertExecutionIsIntact(fixture, deleted, "before the deletion");
			int64_t nCaptureColumns = countRows(fixture, "SELECT COUNT(*) FROM datacapture_columns WHERE captureuuid IN (SELECT uuid FROM datacaptures WHERE executionuuid=?)", deleted.m_sUUID);
			assertTrue(nCaptureColumns == 2, "The capture has its columns before the deletion");

			std::string sStreams = deleted.m_pExecution->ListStorageStreamUUIDs();
			for (auto& sStreamUUID : deleted.m_AttachmentStreams)
				assertTrue(listContains(sStreams, sStreamUUID), "The stream list holds the attachment streams");
			for (auto& sStreamUUID : deleted.m_SegmentStreams)
				assertTrue(listContains(sStreams, sStreamUUID), "The stream list holds the capture segments");
			assertFalse(listContains(sStreams, kept.m_AttachmentStreams[0]), "The stream list holds no stream of another execution");

			// A finished capture needs no abort.
			deleted.m_pExecution->DeleteExecution(false, getCurrentTimestamp());

			assertExecutionIsGone(fixture, deleted, "after the deletion");
			assertTrue(countRows(fixture, "SELECT COUNT(*) FROM datacapture_segments WHERE storagestreamuuid=?", AMCCommon::CUtils::normalizeUUIDString(deleted.m_SegmentStreams[0])) == 0, "The segment rows are deleted");
			assertTrue(deleted.m_pExecution->ListStorageStreamUUIDs().empty(), "A deleted execution has no streams");

			// The other execution of the same build and the build itself are untouched.
			assertExecutionIsIntact(fixture, kept, "the other execution");
			assertTrue(streamFileExists(fixture, fixture.m_pJob->GetStorageStreamUUID()), "The stream of the build is untouched");

			// Deleting again is not an error: nothing is left.
			deleted.m_pExecution->DeleteExecution(false, getCurrentTimestamp());
			deleted.m_pExecution->DeleteExecution(true, getCurrentTimestamp());
			assertExecutionIsGone(fixture, deleted, "after a second deletion");
			assertExecutionIsIntact(fixture, kept, "the other execution after a second deletion");
		}

		void testRecordingCapture()
		{
			auto fixture = createFixture("recording");

			// A capture that was created and never finished: this is what the database holds after a hard stop
			// of the server in the middle of a recording.
			auto content = createExecution(fixture, "Recording", 1, 2, false);
			assertTrue(content.m_pExecution->RetrieveDataCapture("rtcrecording")->GetStatus() == LibMCData::eDataCaptureStatus::Recording, "The capture is recording");

			std::string sMessage;
			assertTrue(errorCodeOf([&]() { content.m_pExecution->DeleteExecution(false, getCurrentTimestamp()); }, &sMessage) == LIBMCDATA_ERROR_BUILDJOBEXECUTIONHASRECORDINGCAPTURE, "A recording capture blocks the deletion");
			assertTrue(sMessage.find(content.m_sUUID) != std::string::npos, "The error names the execution");
			assertExecutionIsIntact(fixture, content, "after the refused deletion");
			assertTrue(content.m_pExecution->RetrieveDataCapture("rtcrecording")->GetStatus() == LibMCData::eDataCaptureStatus::Recording, "The refused deletion leaves the capture recording");

			content.m_pExecution->DeleteExecution(true, getCurrentTimestamp());
			assertExecutionIsGone(fixture, content, "after the deletion with abort");

			// A capture that was aborted in the regular way does not need the flag.
			auto aborted = createExecution(fixture, "Aborted", 1, 2, false);
			aborted.m_pExecution->RetrieveDataCapture("rtcrecording")->Abort(getCurrentTimestamp());
			for (auto& sStreamUUID : aborted.m_SegmentStreams)
				assertFalse(streamFileExists(fixture, sStreamUUID), "Abort purges the segments");
			aborted.m_pExecution->DeleteExecution(false, getCurrentTimestamp());
			assertExecutionIsGone(fixture, aborted, "after the deletion of an aborted capture");
		}

		void testRemovedList()
		{
			auto fixture = createFixture("removed");

			auto first = createExecution(fixture, "First", 1, 0, false);
			auto second = createExecution(fixture, "Second", 1, 1, true);

			uint64_t nHeadBefore = fixture.m_pBuildJobHandler->GetExecutionListHeadID();
			assertTrue(fixture.m_pBuildJobHandler->ListRemovedJobExecutionsSince(0).empty(), "Nothing is removed before the deletion");
			assertTrue(fixture.m_pBuildJobHandler->RetrieveJob(fixture.m_pJob->GetUUID())->GetExecutionCount() == 2, "The build has two executions");

			uint64_t nBuildHeadBefore = fixture.m_pBuildJobHandler->GetBuildListHeadID();

			second.m_pExecution->DeleteExecution(false, getCurrentTimestamp());

			uint64_t nHeadAfter = fixture.m_pBuildJobHandler->GetExecutionListHeadID();
			assertTrue(nHeadAfter > nHeadBefore, "The deletion moves the head of the execution list");

			std::string sRemoved = fixture.m_pBuildJobHandler->ListRemovedJobExecutionsSince(nHeadBefore);
			assertTrue(listContains(sRemoved, second.m_sUUID), "The deleted execution is reported as removed");
			assertFalse(listContains(sRemoved, first.m_sUUID), "The other execution is not reported as removed");
			assertTrue(fixture.m_pBuildJobHandler->ListRemovedJobExecutionsSince(nHeadAfter).empty(), "Nothing is removed after the new head");
			assertTrue(listContains(fixture.m_pBuildJobHandler->ListRemovedJobExecutionsSince(0), second.m_sUUID), "A full comparison reports the deleted execution as well");

			auto pChanged = fixture.m_pBuildJobHandler->ListJobExecutionsChangedSince(nHeadBefore);
			while (pChanged->MoveNext())
				assertTrue(pChanged->GetCurrentJobExecution()->GetExecutionUUID() != second.m_sUUID, "The deleted execution is not a changed row");

			uint32_t nListed = 0;
			auto pAll = fixture.m_pBuildJobHandler->ListJobExecutions("", "", "");
			while (pAll->MoveNext()) {
				nListed++;
				assertTrue(pAll->GetCurrentJobExecution()->GetExecutionUUID() == first.m_sUUID, "Only the other execution is listed");
			}
			assertTrue(nListed == 1, "The execution list holds one execution");

			// The build list shows the number of executions; the deletion reports the build as changed.
			assertTrue(fixture.m_pBuildJobHandler->RetrieveJob(fixture.m_pJob->GetUUID())->GetExecutionCount() == 1, "The build has one execution left");
			assertTrue(fixture.m_pBuildJobHandler->GetBuildListHeadID() > nBuildHeadBefore, "The deletion moves the head of the build list");

			bool bBuildListed = false;
			auto pChangedJobs = fixture.m_pBuildJobHandler->ListJobsChangedSince(nBuildHeadBefore);
			while (pChangedJobs->MoveNext()) {
				auto pJob = pChangedJobs->GetCurrentJob();
				if (pJob->GetUUID() == fixture.m_pJob->GetUUID()) {
					bBuildListed = true;
					assertTrue(pJob->GetExecutionCount() == 1, "The changed build row has the new execution count");
				}
			}
			assertTrue(bBuildListed, "The build is a changed row of the build list");
		}

		void testResumableDeletion()
		{
#ifdef _WIN32
			auto fixture = createFixture("resume");

			auto content = createExecution(fixture, "Resumable", 3, 1, true);
			std::string sBlockedStream = content.m_AttachmentStreams[1];

			{
				// An open reader blocks the deletion of its file on Windows, like a download of the stream does.
				std::ifstream blocker(AMCCommon::CUtils::UTF8toUTF16(streamPath(fixture, sBlockedStream)).c_str(), std::ios::in | std::ios::binary);
				assertTrue(blocker.is_open(), "The stream file can be opened");

				std::string sMessage;
				assertTrue(errorCodeOf([&]() { content.m_pExecution->DeleteExecution(false, getCurrentTimestamp()); }, &sMessage) == LIBMCDATA_ERROR_COULDNOTDELETEBUILDJOBEXECUTION, "A stream in use fails the deletion");
				assertTrue(sMessage.find(AMCCommon::CUtils::normalizeUUIDString(sBlockedStream)) != std::string::npos, "The error names the stream that is in use: " + sMessage);

				// The other streams are gone, the blocked one keeps its file and its references, and the
				// execution stays in place so that the deletion can be repeated.
				assertFalse(streamFileExists(fixture, content.m_AttachmentStreams[0]), "The first stream is deleted");
				assertFalse(streamFileExists(fixture, content.m_AttachmentStreams[2]), "The third stream is deleted");
				assertFalse(streamFileExists(fixture, content.m_SegmentStreams[0]), "The capture segment is deleted");
				assertTrue(streamFileExists(fixture, sBlockedStream), "The stream in use keeps its file");
				assertTrue(fixture.m_pStorage->StreamIsReady(sBlockedStream), "The stream in use keeps its entry");
				assertTrue(countRows(fixture, "SELECT COUNT(*) FROM buildjobexecutiondata WHERE executionuuid=?", content.m_sUUID) == 1, "The attachment of the stream in use is left");
				assertTrue(executionExists(fixture, content.m_sUUID), "The execution stays in place after a partial deletion");
				assertTrue(fixture.m_pBuildJobHandler->ListRemovedJobExecutionsSince(0).empty(), "A partially deleted execution is not reported as removed");

				// Repeated while the stream is still in use: the same failure, nothing else changes.
				assertTrue(errorCodeOf([&]() { content.m_pExecution->DeleteExecution(false, getCurrentTimestamp()); }) == LIBMCDATA_ERROR_COULDNOTDELETEBUILDJOBEXECUTION, "The deletion fails again while the stream is in use");
				assertTrue(executionExists(fixture, content.m_sUUID), "The execution still stays in place");
			}

			content.m_pExecution->DeleteExecution(false, getCurrentTimestamp());
			assertExecutionIsGone(fixture, content, "after the repeated deletion");
			assertTrue(listContains(fixture.m_pBuildJobHandler->ListRemovedJobExecutionsSince(0), content.m_sUUID), "The execution is reported as removed after the repeated deletion");
#else
			logInfo("ResumableDeletion skipped: the test relies on an open file blocking its deletion, which only Windows does");
#endif
		}

	};

}

#endif // __AMCTEST_UNITTEST_LIBMCDATA_EXECUTIONDELETION
