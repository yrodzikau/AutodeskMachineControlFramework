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

#ifndef __AMCTEST_UNITTEST_ZIPSTREAMREADER
#define __AMCTEST_UNITTEST_ZIPSTREAMREADER

#include "amc_unittests.hpp"
#include "amc_unittests_libmcdata.hpp"
#include "amc_unittests_logger.hpp"
#include "common_utils.hpp"
#include "common_chrono.hpp"
#include "common_importstream_native.hpp"
#include "libmcdata_dynamic.hpp"

#include "amc_processdirectory.hpp"
#include "libmcenv_zipstreamreader.hpp"
#include "libmcenv_workingdirectory.hpp"
#include "libmcenv_workingfile.hpp"
#include "libmcenv_interfaceexception.hpp"

#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <functional>
#include <memory>
#include <string>
#include <system_error>
#include <vector>

namespace AMCUnitTest {

	// Tests of the ZIP reader of the storage (LibMCEnv ZIPStreamReader and ZIPEntryExtractor) and of the
	// working directory that a state machine gets from its state environment.
	//
	// Two tests read files from outside the repository and are skipped with a message without them:
	//   ExternalArchives   reads every *.zip of the directory in the environment variable AMCF_UNITTEST_ZIPDIR.
	//   LargeZIP64Entry    writes and extracts an entry of more than 4 GiB if the disk has 10 GB of free space.
	class CUnitTestGroup_ZIPStreamReader : public CUnitTestGroup {
	public:
		std::string getTestGroupName() override {
			return "ZIPStreamReader";
		}

		void registerTests() override {
			registerTest("ReadEntries", "Entry list, sizes, content and piecewise extraction of a ZIP storage stream", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ZIPStreamReader::testReadEntries, this));
			registerTest("Errors", "Missing entries, invalid indices, size limits, invalid file names and streams that are no ZIP", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ZIPStreamReader::testErrors, this));
			registerTest("CorruptEntryAndPartialFile", "A corrupt entry fails at extraction and no partial file is left behind", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ZIPStreamReader::testCorruptEntryAndPartialFile, this));
			registerTest("ReadEntryHead", "The head of an entry is read without extracting the entry", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ZIPStreamReader::testReadEntryHead, this));
			registerTest("UnsupportedCompressionMethod", "An entry with another method than Stored and Deflate is refused with the method name", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ZIPStreamReader::testUnsupportedCompressionMethod, this));
			registerTest("StateMachineWorkingDirectory", "A working directory without resource packages stores files and cleans up", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ZIPStreamReader::testStateMachineWorkingDirectory, this));
			registerTest("ExternalArchives", "Existing archives of AMCF_UNITTEST_ZIPDIR are read completely", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ZIPStreamReader::testExternalArchives, this));
			registerTest("LargeZIP64Entry", "An entry of more than 4 GiB is extracted", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_ZIPStreamReader::testLargeZIP64Entry, this));
		}

		void initializeTests() override {
		}

	private:

		typedef std::unique_ptr<LibMCEnv::Impl::CZIPStreamReader> UReader;
		typedef std::unique_ptr<LibMCEnv::Impl::IZIPEntryExtractor> UExtractor;
		typedef std::unique_ptr<LibMCEnv::Impl::IWorkingFile> UWorkingFile;
		typedef std::unique_ptr<LibMCEnv::Impl::CWorkingDirectory> UWorkingDirectory;

		struct SFixture {
			LibMCData::PWrapper m_pDataWrapper;
			LibMCData::PDataModel m_pDataModel;
			LibMCData::PStorage m_pStorage;
			AMCCommon::PChrono m_pChrono;
			AMC::PLogger m_pLogger;
			std::string m_sBasePath;
			std::string m_sUserUUID;
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

			fixture.m_sBasePath = sRootPath + "/zipstreamreader_" + sSuffix + "_" + AMCCommon::CUtils::createUUID();
			if (!AMCCommon::CUtils::fileOrPathExistsOnDisk(fixture.m_sBasePath))
				AMCCommon::CUtils::createDirectoryOnDisk(fixture.m_sBasePath);

			std::string sDatabaseFile = fixture.m_sBasePath + "/storage.db";

			fixture.m_pDataWrapper = AMCUnitTest::loadLibMCDataInProcess();
			fixture.m_pDataModel = fixture.m_pDataWrapper->CreateDataModelInstance();
			fixture.m_pDataModel->InitialiseDatabase(fixture.m_sBasePath, LibMCData::eDataBaseType::SqLite, sDatabaseFile);
			fixture.m_pStorage = fixture.m_pDataModel->CreateStorage();
			fixture.m_pChrono = std::make_shared<AMCCommon::CChrono>();
			fixture.m_pLogger = std::make_shared<CLogger_TestRecorder>(fixture.m_pChrono, false);
			fixture.m_sUserUUID = AMCCommon::CUtils::createUUID();

			return fixture;
		}

		// The working directory as CStateEnvironment::CreateWorkingDirectory creates it: no resource packages.
		UWorkingDirectory createWorkingDirectory(SFixture& fixture)
		{
			auto pStructure = std::make_shared<AMC::CProcessDirectoryStructure>(fixture.m_sBasePath, fixture.m_pChrono, fixture.m_pLogger);
			return UWorkingDirectory(new LibMCEnv::Impl::CWorkingDirectory(pStructure, pStructure->getRootDirectory(), nullptr, nullptr, fixture.m_pChrono, fixture.m_pLogger));
		}

		// Bytes that deflate can not compress.
		std::vector<uint8_t> createRandomData(size_t nSize, uint32_t nSeed)
		{
			std::vector<uint8_t> data(nSize);
			uint32_t nState = nSeed;
			for (size_t nIndex = 0; nIndex < nSize; nIndex++) {
				nState = nState * 1664525u + 1013904223u;
				data[nIndex] = (uint8_t)(nState >> 24);
			}
			return data;
		}

		std::vector<uint8_t> createTextData(size_t nLineCount)
		{
			std::string sText = "Timestamp;Target X;Target Y;LaserOn\n";
			for (size_t nIndex = 0; nIndex < nLineCount; nIndex++)
				sText += std::to_string(nIndex * 10) + ";" + std::to_string(nIndex) + ".000;-" + std::to_string(nIndex) + ".500;1\n";
			return std::vector<uint8_t>(sText.begin(), sText.end());
		}

		struct SEntry {
			std::string m_sName;
			std::vector<uint8_t> m_Data;
		};

		// Writes a ZIP storage stream with the ZIP writer of the storage and returns its UUID.
		std::string createZIPStream(SFixture& fixture, const std::string& sName, const std::vector<SEntry>& entries)
		{
			std::string sUUID = AMCCommon::CUtils::createUUID();
			auto pZIPWriter = fixture.m_pStorage->CreateZIPStream(sUUID, sName, fixture.m_sUserUUID, getCurrentTimestamp());

			for (auto& entry : entries) {
				uint32_t nEntryID = pZIPWriter->StartNewEntry(entry.m_sName, getCurrentTimestamp());
				if (!entry.m_Data.empty())
					pZIPWriter->WriteData(nEntryID, entry.m_Data);
				pZIPWriter->FinishCurrentEntry();
			}

			pZIPWriter->Finish();
			return sUUID;
		}

		std::string storeBytesAsStream(SFixture& fixture, const std::string& sName, const std::vector<uint8_t>& bytes)
		{
			std::string sUUID = AMCCommon::CUtils::createUUID();
			fixture.m_pStorage->StoreNewStream(sUUID, sName, "application/zip", bytes, fixture.m_sUserUUID, getCurrentTimestamp());
			return sUUID;
		}

		std::vector<uint8_t> readStreamBytes(SFixture& fixture, const std::string& sUUID)
		{
			std::vector<uint8_t> bytes;
			fixture.m_pStorage->RetrieveStream(sUUID)->GetContent(bytes);
			return bytes;
		}

		UReader openReader(SFixture& fixture, const std::string& sUUID)
		{
			return std::make_unique<LibMCEnv::Impl::CZIPStreamReader>(fixture.m_pStorage->RetrieveStream(sUUID));
		}

		std::vector<uint8_t> readFileBytes(const std::string& sAbsoluteFileName)
		{
			AMCCommon::CImportStream_Native stream(sAbsoluteFileName);
			uint64_t nSize = stream.retrieveSize();
			std::vector<uint8_t> bytes((size_t)nSize);
			if (nSize > 0)
				stream.readBuffer(bytes.data(), nSize, true);
			return bytes;
		}

		// Extracts an entry in pieces of nChunkSize bytes and returns the file content.
		std::vector<uint8_t> extractEntry(LibMCEnv::Impl::CZIPStreamReader* pReader, LibMCEnv::Impl::CWorkingDirectory* pWorkingDirectory, const std::string& sEntryName, const std::string& sFileName, uint64_t nChunkSize, uint64_t& nCallCount)
		{
			UExtractor pExtractor(pReader->CreateEntryExtractor(sEntryName, pWorkingDirectory, sFileName));
			assertFalse(pExtractor->IsFinished(), "A new extractor is not finished");

			nCallCount = 0;
			uint64_t nLastExtractedBytes = 0;
			while (!pExtractor->ExtractChunk(nChunkSize)) {
				nCallCount++;
				uint64_t nExtractedBytes = pExtractor->GetExtractedBytes();
				assertTrue(nExtractedBytes - nLastExtractedBytes <= nChunkSize, "A piece is not larger than the chunk size");
				nLastExtractedBytes = nExtractedBytes;
				assertTrue(nCallCount < 100000000ULL, "Extraction should terminate");
			}
			nCallCount++;

			assertTrue(pExtractor->IsFinished(), "Extractor is finished");
			assertTrue(pExtractor->GetExtractedBytes() == pExtractor->GetEntrySize(), "All bytes are extracted");

			UWorkingFile pFile(pExtractor->GetWorkingFile());
			assertTrue(pFile->FileExists(), "Extracted file exists");
			assertTrue(pFile->GetSize() == pExtractor->GetEntrySize(), "Extracted file has the entry size");

			auto bytes = readFileBytes(pFile->GetAbsoluteFileName());
			assertTrue(pFile->DeleteFromDisk(), "Extracted file can be deleted");
			return bytes;
		}

		// Runs the call and asserts that it fails with the given LibMCEnv error. Returns the error message.
		std::string expectEnvError(LibMCEnvResult nExpectedError, const std::string& sContext, std::function<void()> call)
		{
			bool bThrown = false;
			std::string sMessage;
			try {
				call();
			}
			catch (ELibMCEnvInterfaceException& E) {
				bThrown = true;
				sMessage = E.what();
				assertTrue(E.getErrorCode() == nExpectedError, sContext + ": expected error " + std::to_string(nExpectedError) + ", got " + std::to_string(E.getErrorCode()) + " (" + sMessage + ")");
			}
			assertTrue(bThrown, sContext + ": the call should fail");
			return sMessage;
		}

		bool fileExists(const std::string& sFileName)
		{
			return AMCCommon::CUtils::fileOrPathExistsOnDisk(sFileName);
		}

		uint16_t readUint16(const std::vector<uint8_t>& bytes, size_t nOffset)
		{
			return (uint16_t)(bytes.at(nOffset) | (bytes.at(nOffset + 1) << 8));
		}

		// Offset of the local file header (PK 03 04) or of the central directory header (PK 01 02) of an entry.
		size_t findZIPHeader(const std::vector<uint8_t>& bytes, const std::string& sEntryName, bool bCentralDirectory)
		{
			uint8_t nSignature3 = bCentralDirectory ? 0x01 : 0x03;
			uint8_t nSignature4 = bCentralDirectory ? 0x02 : 0x04;
			size_t nNameLengthOffset = bCentralDirectory ? 28 : 26;
			size_t nNameOffset = bCentralDirectory ? 46 : 30;

			for (size_t nOffset = 0; nOffset + nNameOffset + sEntryName.length() <= bytes.size(); nOffset++) {
				if ((bytes[nOffset] != 0x50) || (bytes[nOffset + 1] != 0x4B) || (bytes[nOffset + 2] != nSignature3) || (bytes[nOffset + 3] != nSignature4))
					continue;
				if (readUint16(bytes, nOffset + nNameLengthOffset) != sEntryName.length())
					continue;
				if (std::string(bytes.begin() + nOffset + nNameOffset, bytes.begin() + nOffset + nNameOffset + sEntryName.length()) == sEntryName)
					return nOffset;
			}

			assertTrue(false, "ZIP header of " + sEntryName + " not found");
			return 0;
		}

		void testReadEntries()
		{
			auto fixture = createFixture("read");

			std::vector<SEntry> entries;
			entries.push_back({ "large.bin", createRandomData(1500000, 17) });
			entries.push_back({ "empty.txt", {} });
			entries.push_back({ "folder/layer.csv", createTextData(2000) });

			std::string sUUID = createZIPStream(fixture, "entries.zip", entries);
			auto pReader = openReader(fixture, sUUID);

			assertTrue(pReader->GetEntryCount() == 3, "ZIP has three entries");
			for (size_t nIndex = 0; nIndex < entries.size(); nIndex++) {
				assertTrue(pReader->GetEntryName(nIndex) == entries[nIndex].m_sName, "Entry name " + entries[nIndex].m_sName);
				assertTrue(pReader->GetEntrySize(nIndex) == entries[nIndex].m_Data.size(), "Entry size by index " + entries[nIndex].m_sName);
				assertTrue(pReader->HasEntry(entries[nIndex].m_sName), "Entry exists " + entries[nIndex].m_sName);
				assertTrue(pReader->GetEntrySizeByName(entries[nIndex].m_sName) == entries[nIndex].m_Data.size(), "Entry size by name " + entries[nIndex].m_sName);

				std::string sContent = pReader->ReadEntryAsString(entries[nIndex].m_sName, 16 * 1024 * 1024);
				assertTrue(std::vector<uint8_t>(sContent.begin(), sContent.end()) == entries[nIndex].m_Data, "Entry content " + entries[nIndex].m_sName);
			}
			assertFalse(pReader->HasEntry("missing.txt"), "A missing entry is reported as missing");
			assertFalse(pReader->HasEntry("layer.csv"), "Entry names include the folder");

			auto pWorkingDirectory = createWorkingDirectory(fixture);
			uint64_t nCallCount = 0;

			// Pieces of one byte: one call per byte and one more that verifies the entry.
			auto textBytes = extractEntry(pReader.get(), pWorkingDirectory.get(), "folder/layer.csv", "layer_1.csv", 1, nCallCount);
			assertTrue(textBytes == entries[2].m_Data, "Extraction byte by byte gives the entry");
			assertTrue(nCallCount >= entries[2].m_Data.size(), "Extraction byte by byte needs a call per byte");

			auto largeBytes = extractEntry(pReader.get(), pWorkingDirectory.get(), "large.bin", "large_1000.bin", 1000, nCallCount);
			assertTrue(largeBytes == entries[0].m_Data, "Extraction in pieces of 1000 bytes gives the entry");
			assertTrue(nCallCount >= 1500, "Extraction in pieces of 1000 bytes needs 1500 calls");

			largeBytes = extractEntry(pReader.get(), pWorkingDirectory.get(), "large.bin", "large_64mb.bin", 64ULL * 1024ULL * 1024ULL, nCallCount);
			assertTrue(largeBytes == entries[0].m_Data, "Extraction in one piece gives the entry");
			assertTrue(nCallCount == 1, "An entry smaller than the chunk size is extracted by one call");

			auto emptyBytes = extractEntry(pReader.get(), pWorkingDirectory.get(), "empty.txt", "empty.txt", 1000, nCallCount);
			assertTrue(emptyBytes.empty(), "An empty entry gives an empty file");

			// An extractor keeps the archive alive after the reader has been released.
			UExtractor pLateExtractor(pReader->CreateEntryExtractor("folder/layer.csv", pWorkingDirectory.get(), "late.csv"));
			pReader.reset();
			while (!pLateExtractor->ExtractChunk(4096)) {}
			UWorkingFile pLateFile(pLateExtractor->GetWorkingFile());
			assertTrue(readFileBytes(pLateFile->GetAbsoluteFileName()) == entries[2].m_Data, "Extraction after the release of the reader gives the entry");

			pLateExtractor.reset();
			pLateFile.reset();
			pWorkingDirectory->CleanUp();
		}

		void testErrors()
		{
			auto fixture = createFixture("errors");

			std::vector<SEntry> entries;
			entries.push_back({ "data.csv", createTextData(100) });
			std::string sUUID = createZIPStream(fixture, "errors.zip", entries);
			auto pReader = openReader(fixture, sUUID);
			auto pWorkingDirectory = createWorkingDirectory(fixture);

			expectEnvError(LIBMCENV_ERROR_ZIPENTRYNOTFOUND, "size of a missing entry", [&]() { pReader->GetEntrySizeByName("missing.csv"); });
			expectEnvError(LIBMCENV_ERROR_ZIPENTRYNOTFOUND, "content of a missing entry", [&]() { pReader->ReadEntryAsString("missing.csv", 1000); });
			expectEnvError(LIBMCENV_ERROR_ZIPENTRYNOTFOUND, "head of a missing entry", [&]() { pReader->ReadEntryHead("missing.csv", 1000); });
			expectEnvError(LIBMCENV_ERROR_ZIPENTRYNOTFOUND, "extractor of a missing entry", [&]() { UExtractor pExtractor(pReader->CreateEntryExtractor("missing.csv", pWorkingDirectory.get(), "missing.csv")); });

			expectEnvError(LIBMCENV_ERROR_INVALIDZIPENTRYINDEX, "name of an invalid index", [&]() { pReader->GetEntryName(1); });
			expectEnvError(LIBMCENV_ERROR_INVALIDZIPENTRYINDEX, "size of an invalid index", [&]() { pReader->GetEntrySize(1); });

			std::string sMessage = expectEnvError(LIBMCENV_ERROR_ZIPENTRYTOOLARGE, "entry larger than the limit", [&]() { pReader->ReadEntryAsString("data.csv", entries[0].m_Data.size() - 1); });
			assertTrue(sMessage.find("data.csv") != std::string::npos, "The size error names the entry");
			assertTrue(pReader->ReadEntryAsString("data.csv", entries[0].m_Data.size()).length() == entries[0].m_Data.size(), "An entry of exactly the limit is read");

			for (std::string sInvalidName : { "..\\x", "a/b", "a\\b", "..", "", "c:x", "a*b" }) {
				expectEnvError(LIBMCENV_ERROR_INVALIDWORKINGFILENAME, "invalid file name '" + sInvalidName + "'", [&]() { UExtractor pExtractor(pReader->CreateEntryExtractor("data.csv", pWorkingDirectory.get(), sInvalidName)); });
			}
			assertFalse(pWorkingDirectory->HasUnmanagedFiles(), "A refused file name creates no file");
			assertTrue(AMCCommon::CUtils::findContentOfDirectory(pWorkingDirectory->GetAbsoluteFilePath(), true, false).empty(), "A refused extractor leaves the working directory empty");

			expectEnvError(LIBMCENV_ERROR_INVALIDPARAM, "chunk size 0", [&]() {
				UExtractor pExtractor(pReader->CreateEntryExtractor("data.csv", pWorkingDirectory.get(), "zero.csv"));
				pExtractor->ExtractChunk(0);
			});

			// Streams that are no ZIP archive.
			std::string sText = "This is a text file with the extension zip.";
			std::string sTextUUID = storeBytesAsStream(fixture, "text.zip", std::vector<uint8_t>(sText.begin(), sText.end()));
			sMessage = expectEnvError(LIBMCENV_ERROR_COULDNOTOPENZIPSTREAM, "text file", [&]() { openReader(fixture, sTextUUID); });
			assertTrue(sMessage.find("text.zip") != std::string::npos, "The open error names the stream");

			std::string sRandomUUID = storeBytesAsStream(fixture, "random.zip", createRandomData(100000, 5));
			expectEnvError(LIBMCENV_ERROR_COULDNOTOPENZIPSTREAM, "random bytes", [&]() { openReader(fixture, sRandomUUID); });

			// A ZIP that was cut off has no central directory.
			auto zipBytes = readStreamBytes(fixture, sUUID);
			zipBytes.resize(zipBytes.size() / 2);
			std::string sCutUUID = storeBytesAsStream(fixture, "cut.zip", zipBytes);
			expectEnvError(LIBMCENV_ERROR_COULDNOTOPENZIPSTREAM, "cut off ZIP", [&]() { openReader(fixture, sCutUUID); });

			pWorkingDirectory->CleanUp();
		}

		void testCorruptEntryAndPartialFile()
		{
			auto fixture = createFixture("corrupt");

			std::vector<SEntry> entries;
			entries.push_back({ "good.csv", createTextData(500) });
			entries.push_back({ "bad.bin", createRandomData(1200000, 99) });
			std::string sUUID = createZIPStream(fixture, "corrupt_source.zip", entries);

			// Flips one byte in the data of bad.bin. Random data is stored nearly unchanged by deflate, so the
			// entry still inflates and fails at its CRC, or it fails while inflating.
			auto zipBytes = readStreamBytes(fixture, sUUID);
			size_t nLocalHeader = findZIPHeader(zipBytes, "bad.bin", false);
			size_t nDataOffset = nLocalHeader + 30 + readUint16(zipBytes, nLocalHeader + 26) + readUint16(zipBytes, nLocalHeader + 28);
			zipBytes.at(nDataOffset + 600000) ^= 0x5A;
			std::string sCorruptUUID = storeBytesAsStream(fixture, "corrupt.zip", zipBytes);

			auto pReader = openReader(fixture, sCorruptUUID);
			auto pWorkingDirectory = createWorkingDirectory(fixture);
			std::string sDirectory = pWorkingDirectory->GetAbsoluteFilePath();

			uint64_t nCallCount = 0;
			assertTrue(extractEntry(pReader.get(), pWorkingDirectory.get(), "good.csv", "good.csv", 1000, nCallCount) == entries[0].m_Data, "The intact entry of a corrupt ZIP is extracted");

			{
				UExtractor pExtractor(pReader->CreateEntryExtractor("bad.bin", pWorkingDirectory.get(), "bad.bin"));
				assertTrue(fileExists(sDirectory + "/bad.bin"), "The extractor creates its file");
				expectEnvError(LIBMCENV_ERROR_ZIPENTRYEXTRACTIONNOTFINISHED, "file of an unfinished extraction", [&]() { UWorkingFile pFile(pExtractor->GetWorkingFile()); });

				std::string sMessage = expectEnvError(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "corrupt entry", [&]() { while (!pExtractor->ExtractChunk(100000)) {} });
				assertTrue(sMessage.find("bad.bin") != std::string::npos, "The extraction error names the entry");
				assertFalse(fileExists(sDirectory + "/bad.bin"), "The file of a failed extraction is deleted");
				assertFalse(pExtractor->IsFinished(), "A failed extraction is not finished");

				expectEnvError(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "extraction after a failure", [&]() { pExtractor->ExtractChunk(100000); });
				expectEnvError(LIBMCENV_ERROR_ZIPENTRYEXTRACTIONNOTFINISHED, "file of a failed extraction", [&]() { UWorkingFile pFile(pExtractor->GetWorkingFile()); });
			}

			expectEnvError(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "corrupt entry as string", [&]() { pReader->ReadEntryAsString("bad.bin", 16 * 1024 * 1024); });

			// An extractor that is released before the end deletes its partial file.
			{
				auto pIntactReader = openReader(fixture, sUUID);
				UExtractor pExtractor(pIntactReader->CreateEntryExtractor("bad.bin", pWorkingDirectory.get(), "partial.bin"));
				assertFalse(pExtractor->ExtractChunk(300000), "The first piece does not finish the entry");
				assertTrue(pExtractor->GetExtractedBytes() == 300000, "The first piece has the chunk size");
				assertTrue(fileExists(sDirectory + "/partial.bin"), "The partial file exists during the extraction");
				pExtractor.reset();
				assertFalse(fileExists(sDirectory + "/partial.bin"), "The partial file is deleted with the extractor");
			}

			// A finished file stays when the extractor is released.
			{
				auto pIntactReader = openReader(fixture, sUUID);
				UExtractor pExtractor(pIntactReader->CreateEntryExtractor("bad.bin", pWorkingDirectory.get(), "complete.bin"));
				while (!pExtractor->ExtractChunk(500000)) {}
				pExtractor.reset();
				assertTrue(fileExists(sDirectory + "/complete.bin"), "The finished file outlives the extractor");
				assertTrue(readFileBytes(sDirectory + "/complete.bin") == entries[1].m_Data, "The finished file has the entry content");
			}

			pWorkingDirectory->CleanUp();
			assertFalse(fileExists(sDirectory + "/complete.bin"), "Clean up deletes the extracted files");
		}

		void testReadEntryHead()
		{
			auto fixture = createFixture("head");

			std::vector<SEntry> entries;
			entries.push_back({ "large.csv", createTextData(200000) });
			entries.push_back({ "short.csv", createTextData(2) });
			entries.push_back({ "empty.csv", {} });
			std::string sUUID = createZIPStream(fixture, "head.zip", entries);
			auto pReader = openReader(fixture, sUUID);

			assertTrue(entries[0].m_Data.size() > 65536, "The large entry is larger than the head");
			std::string sHead = pReader->ReadEntryHead("large.csv", 65536);
			assertTrue(sHead.length() == 65536, "The head of a large entry has MaxBytes bytes");
			assertTrue(std::vector<uint8_t>(sHead.begin(), sHead.end()) == std::vector<uint8_t>(entries[0].m_Data.begin(), entries[0].m_Data.begin() + 65536), "The head is the beginning of the entry");
			assertTrue(sHead.substr(0, sHead.find('\n')) == "Timestamp;Target X;Target Y;LaserOn", "The head contains the first line");

			std::string sShort = pReader->ReadEntryHead("short.csv", 65536);
			assertTrue(std::vector<uint8_t>(sShort.begin(), sShort.end()) == entries[1].m_Data, "An entry shorter than MaxBytes is returned completely");

			assertTrue(pReader->ReadEntryHead("empty.csv", 65536).empty(), "The head of an empty entry is empty");
			assertTrue(pReader->ReadEntryHead("large.csv", 0).empty(), "A head of 0 bytes is empty");

			expectEnvError(LIBMCENV_ERROR_INVALIDPARAM, "head larger than 16 MiB", [&]() { pReader->ReadEntryHead("large.csv", 16ULL * 1024ULL * 1024ULL + 1ULL); });

			// The entry is still readable completely after its head has been read.
			std::string sContent = pReader->ReadEntryAsString("large.csv", 64 * 1024 * 1024);
			assertTrue(sContent.length() == entries[0].m_Data.size(), "The entry is read completely after its head");
		}

		void testUnsupportedCompressionMethod()
		{
			auto fixture = createFixture("method");

			std::vector<SEntry> entries;
			entries.push_back({ "smcdatalayer0.csv", createTextData(300) });
			entries.push_back({ "smcdatalayer1.csv", createTextData(400) });
			std::string sUUID = createZIPStream(fixture, "method_source.zip", entries);

			// Declares smcdatalayer1.csv as Deflate64 (method 9) in its local and its central header, as the
			// Windows Explorer writes entries of more than 2 GB.
			auto zipBytes = readStreamBytes(fixture, sUUID);
			size_t nLocalHeader = findZIPHeader(zipBytes, "smcdatalayer1.csv", false);
			size_t nCentralHeader = findZIPHeader(zipBytes, "smcdatalayer1.csv", true);
			assertTrue(readUint16(zipBytes, nLocalHeader + 8) == 8, "The storage ZIP writer deflates its entries");
			assertTrue(readUint16(zipBytes, nCentralHeader + 10) == 8, "The central directory names Deflate");
			zipBytes.at(nLocalHeader + 8) = 9;
			zipBytes.at(nCentralHeader + 10) = 9;
			std::string sPatchedUUID = storeBytesAsStream(fixture, "method.zip", zipBytes);

			auto pReader = openReader(fixture, sPatchedUUID);
			auto pWorkingDirectory = createWorkingDirectory(fixture);

			assertTrue(pReader->GetEntryCount() == 2, "The patched ZIP lists both entries");
			assertTrue(pReader->GetEntrySizeByName("smcdatalayer1.csv") == entries[1].m_Data.size(), "The size of the unsupported entry is known");

			auto checkMessage = [&](const std::string& sMessage) {
				assertTrue(sMessage.find("smcdatalayer1.csv") != std::string::npos, "The method error names the entry: " + sMessage);
				assertTrue(sMessage.find("Deflate64") != std::string::npos, "The method error names Deflate64: " + sMessage);
				assertTrue(sMessage.find("method 9") != std::string::npos, "The method error names the method number: " + sMessage);
			};

			checkMessage(expectEnvError(LIBMCENV_ERROR_ZIPENTRYCOMPRESSIONNOTSUPPORTED, "head of a Deflate64 entry", [&]() { pReader->ReadEntryHead("smcdatalayer1.csv", 65536); }));
			checkMessage(expectEnvError(LIBMCENV_ERROR_ZIPENTRYCOMPRESSIONNOTSUPPORTED, "content of a Deflate64 entry", [&]() { pReader->ReadEntryAsString("smcdatalayer1.csv", 1024 * 1024); }));
			checkMessage(expectEnvError(LIBMCENV_ERROR_ZIPENTRYCOMPRESSIONNOTSUPPORTED, "extractor of a Deflate64 entry", [&]() { UExtractor pExtractor(pReader->CreateEntryExtractor("smcdatalayer1.csv", pWorkingDirectory.get(), "layer1.csv")); }));
			assertTrue(AMCCommon::CUtils::findContentOfDirectory(pWorkingDirectory->GetAbsoluteFilePath(), true, false).empty(), "A refused extractor creates no file");

			// The other entries of the same archive are readable.
			std::string sContent = pReader->ReadEntryAsString("smcdatalayer0.csv", 1024 * 1024);
			assertTrue(std::vector<uint8_t>(sContent.begin(), sContent.end()) == entries[0].m_Data, "The Deflate entry of the same ZIP is read");
			assertTrue(pReader->ReadEntryHead("smcdatalayer0.csv", 10) == "Timestamp;", "The head of the Deflate entry of the same ZIP is read");

			pWorkingDirectory->CleanUp();
		}

		void testStateMachineWorkingDirectory()
		{
			auto fixture = createFixture("workdir");

			auto pWorkingDirectory = createWorkingDirectory(fixture);
			assertTrue(pWorkingDirectory->IsActive(), "A new working directory is active");

			std::string sDirectory = pWorkingDirectory->GetAbsoluteFilePath();
			assertTrue(fileExists(sDirectory), "The working directory exists on disk");
			assertTrue(sDirectory.find(fixture.m_sBasePath) == 0, "The working directory is below the temp base path");

			UWorkingFile pFile(pWorkingDirectory->StoreCustomString("note.txt", "content"));
			assertTrue(pFile->FileExists(), "A stored file exists");
			assertTrue(pFile->GetSize() == 7, "A stored file has its content");
			assertTrue(pFile->IsManaged(), "A stored file is managed");

			// Without resource packages only the resource methods fail.
			expectEnvError(LIBMCENV_ERROR_INVALIDPARAM, "driver data without a driver package", [&]() { UWorkingFile pResourceFile(pWorkingDirectory->StoreDriverData("driver.bin", "resource")); });
			expectEnvError(LIBMCENV_ERROR_INVALIDPARAM, "machine resource data without a machine package", [&]() { UWorkingFile pResourceFile(pWorkingDirectory->StoreMachineResourceData("machine.bin", "resource")); });

			std::unique_ptr<LibMCEnv::Impl::IWorkingDirectory> pSubDirectory(pWorkingDirectory->CreateSubDirectory("sub"));
			UWorkingFile pSubFile(pSubDirectory->StoreCustomString("sub.txt", "sub content"));
			std::string sSubFileName = pSubFile->GetAbsoluteFileName();
			assertTrue(fileExists(sSubFileName), "A file in a sub directory exists");

			pSubFile.reset();
			pSubDirectory.reset();
			pFile.reset();

			pWorkingDirectory->CleanUp();
			assertFalse(fileExists(sDirectory + "/note.txt"), "Clean up deletes the files");
			assertFalse(fileExists(sSubFileName), "Clean up deletes the files of sub directories");
			assertFalse(fileExists(sDirectory), "Clean up deletes the directory");
		}

		void testExternalArchives()
		{
			const char* pszDirectory = std::getenv("AMCF_UNITTEST_ZIPDIR");
			if ((pszDirectory == nullptr) || (std::string(pszDirectory).empty())) {
				logInfo("ExternalArchives skipped: the environment variable AMCF_UNITTEST_ZIPDIR names no directory with ZIP files");
				return;
			}

			std::error_code errorCode;
			std::vector<std::filesystem::path> archives;
			for (auto& entry : std::filesystem::directory_iterator(std::filesystem::u8path(pszDirectory), errorCode)) {
				if (entry.is_regular_file() && (AMCCommon::CUtils::toLowerString(entry.path().extension().u8string()) == ".zip"))
					archives.push_back(entry.path());
			}
			assertFalse((bool)errorCode, "AMCF_UNITTEST_ZIPDIR can be listed: " + errorCode.message());
			assertFalse(archives.empty(), "AMCF_UNITTEST_ZIPDIR contains ZIP files");

			auto fixture = createFixture("external");
			auto pWorkingDirectory = createWorkingDirectory(fixture);

			for (auto& archivePath : archives) {
				std::string sArchiveName = archivePath.filename().u8string();

				// Uploads the archive the way the upload API stores it: as a partial stream in pieces.
				AMCCommon::CImportStream_Native archiveStream(archivePath.u8string());
				uint64_t nArchiveSize = archiveStream.retrieveSize();

				std::string sUUID = AMCCommon::CUtils::createUUID();
				fixture.m_pStorage->BeginPartialStream(sUUID, sArchiveName, "application/zip", nArchiveSize, fixture.m_sUserUUID, getCurrentTimestamp());

				std::vector<uint8_t> buffer(4 * 1024 * 1024);
				uint64_t nOffset = 0;
				while (nOffset < nArchiveSize) {
					uint64_t nBytes = std::min<uint64_t>(buffer.size(), nArchiveSize - nOffset);
					archiveStream.readBuffer(buffer.data(), nBytes, true);
					fixture.m_pStorage->StorePartialStream(sUUID, nOffset, LibMCData::CInputVector<uint8_t>(buffer.data(), (size_t)nBytes));
					nOffset += nBytes;
				}
				fixture.m_pStorage->FinishPartialStreamBlockwiseSHA256(sUUID, AMCCommon::CUtils::calculateBlockwiseSHA256FromFile(archivePath.u8string(), 65536));

				auto pReader = openReader(fixture, sUUID);
				uint64_t nEntryCount = pReader->GetEntryCount();
				assertTrue(nEntryCount > 0, sArchiveName + " has entries");

				uint64_t nTotalBytes = 0;
				for (uint64_t nIndex = 0; nIndex < nEntryCount; nIndex++) {
					std::string sEntryName = pReader->GetEntryName(nIndex);
					if (sEntryName.empty() || (sEntryName.back() == '/'))
						continue;

					// Reading to the end verifies size and CRC of the entry.
					UExtractor pExtractor(pReader->CreateEntryExtractor(sEntryName, pWorkingDirectory.get(), "entry_" + std::to_string(nIndex) + ".bin"));
					while (!pExtractor->ExtractChunk(64ULL * 1024ULL * 1024ULL)) {}
					assertTrue(pExtractor->GetExtractedBytes() == pReader->GetEntrySize(nIndex), sArchiveName + ": " + sEntryName + " is extracted completely");
					nTotalBytes += pExtractor->GetExtractedBytes();

					UWorkingFile pFile(pExtractor->GetWorkingFile());
					pFile->DeleteFromDisk();
				}

				logInfo("ExternalArchives: " + sArchiveName + ": " + std::to_string(nEntryCount) + " entries, " + std::to_string(nTotalBytes) + " bytes extracted");

				pReader.reset();
				fixture.m_pStorage->DeleteStream(sUUID);
			}

			pWorkingDirectory->CleanUp();
		}

		void testLargeZIP64Entry()
		{
			const uint64_t nRequiredFreeBytes = 10ULL * 1024ULL * 1024ULL * 1024ULL;

			std::error_code errorCode;
			auto spaceInfo = std::filesystem::space(std::filesystem::current_path(), errorCode);
			if (errorCode || (spaceInfo.available < nRequiredFreeBytes)) {
				logInfo("LargeZIP64Entry skipped: the test needs 10 GB of free disk space");
				return;
			}

			auto fixture = createFixture("zip64");

			// 4 GiB + 16 MiB of a repeating text block: the ZIP stays small, the entry needs ZIP64 sizes.
			const uint64_t nBlockSize = 16ULL * 1024ULL * 1024ULL;
			const uint64_t nBlockCount = 257;
			std::vector<uint8_t> block((size_t)nBlockSize);
			for (size_t nIndex = 0; nIndex < block.size(); nIndex++)
				block[nIndex] = (uint8_t)("0123456789;\n"[nIndex % 12]);

			std::string sUUID = AMCCommon::CUtils::createUUID();
			auto pZIPWriter = fixture.m_pStorage->CreateZIPStream(sUUID, "zip64.zip", fixture.m_sUserUUID, getCurrentTimestamp());
			uint32_t nSmallEntryID = pZIPWriter->StartNewEntry("before.txt", getCurrentTimestamp());
			pZIPWriter->WriteData(nSmallEntryID, std::vector<uint8_t>({ 'a', 'b', 'c' }));
			pZIPWriter->FinishCurrentEntry();
			uint32_t nLargeEntryID = pZIPWriter->StartNewEntry("large.csv", getCurrentTimestamp());
			for (uint64_t nBlockIndex = 0; nBlockIndex < nBlockCount; nBlockIndex++)
				pZIPWriter->WriteData(nLargeEntryID, block);
			pZIPWriter->FinishCurrentEntry();
			uint32_t nLastEntryID = pZIPWriter->StartNewEntry("after.txt", getCurrentTimestamp());
			pZIPWriter->WriteData(nLastEntryID, std::vector<uint8_t>({ 'x', 'y', 'z' }));
			pZIPWriter->FinishCurrentEntry();
			pZIPWriter->Finish();
			pZIPWriter = nullptr;

			auto pReader = openReader(fixture, sUUID);
			assertTrue(pReader->GetEntryCount() == 3, "The ZIP64 archive has three entries");
			assertTrue(pReader->GetEntrySizeByName("large.csv") == nBlockSize * nBlockCount, "The entry size is larger than 4 GiB");
			assertTrue(pReader->ReadEntryAsString("before.txt", 100) == "abc", "The entry before the large entry is read");
			assertTrue(pReader->ReadEntryAsString("after.txt", 100) == "xyz", "The entry behind the large entry is read");
			assertTrue(pReader->ReadEntryHead("large.csv", 24) == "0123456789;\n0123456789;\n", "The head of the large entry is read");

			auto pWorkingDirectory = createWorkingDirectory(fixture);
			{
				UExtractor pExtractor(pReader->CreateEntryExtractor("large.csv", pWorkingDirectory.get(), "large.csv"));
				uint64_t nCallCount = 0;
				while (!pExtractor->ExtractChunk(64ULL * 1024ULL * 1024ULL))
					nCallCount++;
				assertTrue(nCallCount >= 64, "The large entry is extracted in pieces of 64 MB");
				assertTrue(pExtractor->GetExtractedBytes() == nBlockSize * nBlockCount, "The large entry is extracted completely");

				UWorkingFile pFile(pExtractor->GetWorkingFile());
				assertTrue(pFile->GetSize() == nBlockSize * nBlockCount, "The extracted file is larger than 4 GiB");
				assertTrue(pFile->DeleteFromDisk(), "The extracted file is deleted");
			}

			pWorkingDirectory->CleanUp();
			pReader.reset();
			fixture.m_pStorage->DeleteStream(sUUID);
		}

	};

}

#endif // __AMCTEST_UNITTEST_ZIPSTREAMREADER
