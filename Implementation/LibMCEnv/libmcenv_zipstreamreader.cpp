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


Abstract: Read access to a ZIP file in the storage. libzip reads the archive through a function source that
forwards to the read and seek callbacks of the storage stream, so the file is never loaded as a whole.

*/

#include "libmcenv_zipstreamreader.hpp"
#include "libmcenv_interfaceexception.hpp"
#include "libmcenv_workingdirectory.hpp"
#include "libmcenv_workingfile.hpp"

// Include custom headers here.
#include "common_utils.hpp"
#include "zip.h"

#include <algorithm>
#include <filesystem>
#include <system_error>

using namespace LibMCEnv::Impl;

#define ZIPSTREAMREADER_READBLOCKSIZE (1024ULL * 1024ULL)
#define ZIPSTREAMREADER_MAXHEADBYTES (16ULL * 1024ULL * 1024ULL)

namespace LibMCEnv {
namespace Impl {

	/*************************************************************************************************************************
	 libzip function source over the callbacks of a storage stream. The state is created with the source and
	 deleted by libzip with ZIP_SOURCE_FREE. The storage stream callbacks report errors as codes and never throw,
	 so no exception crosses the C boundary of libzip.
	**************************************************************************************************************************/

	struct sZIPStreamSourceState {
		LibMCData::PStorageStream m_pStream;
		LibMCData::StreamReadCallback m_pReadCallback;
		LibMCData::StreamSeekCallback m_pSeekCallback;
		void* m_pUserData;
		uint64_t m_nSize;
		// Read position of the source as libzip sees it.
		uint64_t m_nPosition;
		// Position of the underlying stream, to skip seeks of sequential reads.
		uint64_t m_nStreamPosition;
		bool m_bStreamPositionIsValid;
		zip_error_t m_Error;
	};

	static zip_int64_t zipStreamSourceCallback(void* pState, void* pData, zip_uint64_t nLength, zip_source_cmd_t eCommand)
	{
		sZIPStreamSourceState* pSourceState = (sZIPStreamSourceState*)pState;

		switch (eCommand) {
			case ZIP_SOURCE_SUPPORTS:
				return (zip_int64_t)ZIP_SOURCE_SUPPORTS_SEEKABLE;

			case ZIP_SOURCE_OPEN:
				pSourceState->m_nPosition = 0;
				return 0;

			case ZIP_SOURCE_CLOSE:
				return 0;

			case ZIP_SOURCE_READ: {
				if (pSourceState->m_nPosition >= pSourceState->m_nSize)
					return 0;

				uint64_t nBytesToRead = std::min<uint64_t>(nLength, pSourceState->m_nSize - pSourceState->m_nPosition);
				if (nBytesToRead > (uint64_t)ZIP_INT64_MAX) {
					zip_error_set(&pSourceState->m_Error, ZIP_ER_INVAL, 0);
					return -1;
				}
				if (nBytesToRead == 0)
					return 0;

				if ((!pSourceState->m_bStreamPositionIsValid) || (pSourceState->m_nStreamPosition != pSourceState->m_nPosition)) {
					uint32_t nSeekErrorCode = 0;
					pSourceState->m_bStreamPositionIsValid = false;
					pSourceState->m_pSeekCallback(pSourceState->m_nPosition, pSourceState->m_pUserData, &nSeekErrorCode);
					if (nSeekErrorCode != 0) {
						zip_error_set(&pSourceState->m_Error, ZIP_ER_SEEK, 0);
						return -1;
					}
					pSourceState->m_nStreamPosition = pSourceState->m_nPosition;
					pSourceState->m_bStreamPositionIsValid = true;
				}

				uint32_t nReadErrorCode = 0;
				pSourceState->m_pReadCallback(pData, nBytesToRead, pSourceState->m_pUserData, &nReadErrorCode);
				if (nReadErrorCode != 0) {
					pSourceState->m_bStreamPositionIsValid = false;
					zip_error_set(&pSourceState->m_Error, ZIP_ER_READ, 0);
					return -1;
				}

				pSourceState->m_nPosition += nBytesToRead;
				pSourceState->m_nStreamPosition = pSourceState->m_nPosition;
				return (zip_int64_t)nBytesToRead;
			}

			case ZIP_SOURCE_SEEK: {
				zip_int64_t nNewOffset = zip_source_seek_compute_offset(pSourceState->m_nPosition, pSourceState->m_nSize, pData, nLength, &pSourceState->m_Error);
				if (nNewOffset < 0)
					return -1;

				pSourceState->m_nPosition = (uint64_t)nNewOffset;
				return 0;
			}

			case ZIP_SOURCE_TELL:
				if (pSourceState->m_nPosition > (uint64_t)ZIP_INT64_MAX) {
					zip_error_set(&pSourceState->m_Error, ZIP_ER_TELL, 0);
					return -1;
				}
				return (zip_int64_t)pSourceState->m_nPosition;

			case ZIP_SOURCE_STAT: {
				if (nLength < sizeof(zip_stat_t)) {
					zip_error_set(&pSourceState->m_Error, ZIP_ER_INVAL, 0);
					return -1;
				}

				zip_stat_t* pStat = (zip_stat_t*)pData;
				zip_stat_init(pStat);
				pStat->size = pSourceState->m_nSize;
				pStat->comp_size = pSourceState->m_nSize;
				pStat->comp_method = ZIP_CM_STORE;
				pStat->encryption_method = ZIP_EM_NONE;
				pStat->valid = ZIP_STAT_SIZE | ZIP_STAT_COMP_SIZE | ZIP_STAT_COMP_METHOD | ZIP_STAT_ENCRYPTION_METHOD;
				return (zip_int64_t)sizeof(zip_stat_t);
			}

			case ZIP_SOURCE_ERROR:
				return zip_error_to_data(&pSourceState->m_Error, pData, nLength);

			case ZIP_SOURCE_FREE:
				zip_error_fini(&pSourceState->m_Error);
				delete pSourceState;
				return 0;

			default:
				zip_error_set(&pSourceState->m_Error, ZIP_ER_OPNOTSUPP, 0);
				return -1;
		}
	}


	// Owns a zip_error_t for the calls that report through one.
	class CZIPStreamReaderError {
	public:
		zip_error_t m_Error;

		CZIPStreamReaderError()
		{
			zip_error_init(&m_Error);
		}

		~CZIPStreamReaderError()
		{
			zip_error_fini(&m_Error);
		}

		CZIPStreamReaderError(const CZIPStreamReaderError&) = delete;
		CZIPStreamReaderError& operator=(const CZIPStreamReaderError&) = delete;

		std::string getMessage()
		{
			const char* pszMessage = zip_error_strerror(&m_Error);
			if (pszMessage == nullptr)
				return "unknown error";
			return pszMessage;
		}
	};


	static std::string getZIPCompressionMethodName(uint32_t nMethod)
	{
		switch (nMethod) {
			case ZIP_CM_STORE: return "Stored";
			case ZIP_CM_DEFLATE: return "Deflate";
			case ZIP_CM_DEFLATE64: return "Deflate64";
			case ZIP_CM_BZIP2: return "bzip2";
			case ZIP_CM_LZMA: return "LZMA";
			case 93: return "Zstandard";
			case 95: return "XZ";
			case ZIP_CM_PPMD: return "PPMd";
			default: return "";
		}
	}


	/*************************************************************************************************************************
	 The open archive. Shared by the reader and its extractors; all libzip calls are serialised by a mutex.
	**************************************************************************************************************************/

	class CZIPStreamReaderArchive {
	private:
		zip_t* m_pZIPArchive;
		std::mutex m_Mutex;
		std::vector<std::string> m_EntryNames;
		std::map<std::string, uint64_t> m_EntryIndices;

	public:

		CZIPStreamReaderArchive(LibMCData::PStorageStream pStorageStream)
			: m_pZIPArchive(nullptr)
		{
			if (pStorageStream.get() == nullptr)
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_INVALIDPARAM);

			void* pReadCallback = nullptr;
			void* pSeekCallback = nullptr;
			void* pUserData = nullptr;
			pStorageStream->GetCallbacks(pReadCallback, pSeekCallback, pUserData);
			if ((pReadCallback == nullptr) || (pSeekCallback == nullptr) || (pUserData == nullptr))
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTOPENZIPSTREAM, "storage stream has no read access: " + pStorageStream->GetUUID());

			std::string sStreamName = pStorageStream->GetName();

			CZIPStreamReaderError openError;

			auto pOwnedState = std::make_unique<sZIPStreamSourceState>();
			pOwnedState->m_pStream = pStorageStream;
			pOwnedState->m_pReadCallback = (LibMCData::StreamReadCallback)pReadCallback;
			pOwnedState->m_pSeekCallback = (LibMCData::StreamSeekCallback)pSeekCallback;
			pOwnedState->m_pUserData = pUserData;
			pOwnedState->m_nSize = pStorageStream->GetSize();
			pOwnedState->m_nPosition = 0;
			pOwnedState->m_nStreamPosition = 0;
			pOwnedState->m_bStreamPositionIsValid = false;
			zip_error_init(&pOwnedState->m_Error);

			zip_source_t* pSource = zip_source_function_create(zipStreamSourceCallback, pOwnedState.get(), &openError.m_Error);
			if (pSource == nullptr) {
				zip_error_fini(&pOwnedState->m_Error);
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTOPENZIPSTREAM, sStreamName + ": " + openError.getMessage());
			}

			// From here on libzip deletes the state with ZIP_SOURCE_FREE.
			pOwnedState.release();

			m_pZIPArchive = zip_open_from_source(pSource, ZIP_RDONLY | ZIP_CHECKCONS, &openError.m_Error);
			if (m_pZIPArchive == nullptr) {
				std::string sMessage = openError.getMessage();
				zip_source_free(pSource);
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTOPENZIPSTREAM, sStreamName + ": " + sMessage);
			}

			int64_t nEntryCount = zip_get_num_entries(m_pZIPArchive, ZIP_FL_UNCHANGED);
			if (nEntryCount < 0) {
				zip_discard(m_pZIPArchive);
				m_pZIPArchive = nullptr;
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTOPENZIPSTREAM, sStreamName + ": could not read the entries");
			}

			for (int64_t nIndex = 0; nIndex < nEntryCount; nIndex++) {
				const char* pszName = zip_get_name(m_pZIPArchive, (uint64_t)nIndex, ZIP_FL_ENC_GUESS);
				std::string sName;
				if (pszName != nullptr)
					sName = pszName;

				m_EntryNames.push_back(sName);
				// Of several entries with the same name the first one is found by name.
				m_EntryIndices.insert(std::make_pair(sName, (uint64_t)nIndex));
			}
		}

		~CZIPStreamReaderArchive()
		{
			// Read-only archive: nothing to write back. Frees the source and with it the storage stream.
			if (m_pZIPArchive != nullptr)
				zip_discard(m_pZIPArchive);
			m_pZIPArchive = nullptr;
		}

		CZIPStreamReaderArchive(const CZIPStreamReaderArchive&) = delete;
		CZIPStreamReaderArchive& operator=(const CZIPStreamReaderArchive&) = delete;

		uint64_t getEntryCount()
		{
			return m_EntryNames.size();
		}

		std::string getEntryName(uint64_t nIndex)
		{
			if (nIndex >= m_EntryNames.size())
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_INVALIDZIPENTRYINDEX, "invalid ZIP entry index: " + std::to_string(nIndex));

			return m_EntryNames.at((size_t)nIndex);
		}

		bool hasEntry(const std::string& sName)
		{
			return m_EntryIndices.find(sName) != m_EntryIndices.end();
		}

		uint64_t findEntry(const std::string& sName)
		{
			auto iIter = m_EntryIndices.find(sName);
			if (iIter == m_EntryIndices.end())
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_ZIPENTRYNOTFOUND, "ZIP entry not found: " + sName);

			return iIter->second;
		}

		uint64_t getEntrySize(uint64_t nIndex)
		{
			std::string sName = getEntryName(nIndex);

			std::lock_guard<std::mutex> lockGuard(m_Mutex);

			zip_stat_t entryStat;
			zip_stat_init(&entryStat);
			if (zip_stat_index(m_pZIPArchive, nIndex, ZIP_FL_UNCHANGED, &entryStat) != 0)
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "could not read the size of ZIP entry " + sName + ": " + zip_strerror(m_pZIPArchive));
			if ((entryStat.valid & ZIP_STAT_SIZE) == 0)
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "ZIP entry has no size: " + sName);

			return entryStat.size;
		}

		// Opens an entry for reading. Only Stored and Deflate entries can be read.
		zip_file_t* openEntry(uint64_t nIndex)
		{
			std::string sName = getEntryName(nIndex);

			std::lock_guard<std::mutex> lockGuard(m_Mutex);

			zip_stat_t entryStat;
			zip_stat_init(&entryStat);
			if (zip_stat_index(m_pZIPArchive, nIndex, ZIP_FL_UNCHANGED, &entryStat) != 0)
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "could not read ZIP entry " + sName + ": " + zip_strerror(m_pZIPArchive));

			if ((entryStat.valid & ZIP_STAT_COMP_METHOD) != 0) {
				uint32_t nMethod = entryStat.comp_method;
				if ((nMethod != ZIP_CM_STORE) && (nMethod != ZIP_CM_DEFLATE)) {
					std::string sMethodName = getZIPCompressionMethodName(nMethod);
					std::string sMethod = "method " + std::to_string(nMethod);
					if (!sMethodName.empty())
						sMethod += " (" + sMethodName + ")";

					throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_ZIPENTRYCOMPRESSIONNOTSUPPORTED, sName + " is compressed with " + sMethod + ", only Deflate and Stored can be read");
				}
			}

			zip_file_t* pFile = zip_fopen_index(m_pZIPArchive, nIndex, ZIP_FL_UNCHANGED);
			if (pFile == nullptr)
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "could not open ZIP entry " + sName + ": " + zip_strerror(m_pZIPArchive));

			return pFile;
		}

		// Returns the number of bytes read, 0 at the end of the entry. libzip checks size and CRC when the end is reached.
		uint64_t readEntry(zip_file_t* pFile, uint8_t* pBuffer, uint64_t nBufferSize, const std::string& sName)
		{
			std::lock_guard<std::mutex> lockGuard(m_Mutex);

			zip_int64_t nBytesRead = zip_fread(pFile, pBuffer, nBufferSize);
			if (nBytesRead < 0)
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "could not read ZIP entry " + sName + ": " + zip_file_strerror(pFile));

			return (uint64_t)nBytesRead;
		}

		void closeEntry(zip_file_t* pFile) noexcept
		{
			std::lock_guard<std::mutex> lockGuard(m_Mutex);
			zip_fclose(pFile);
		}

	};


	// An entry that is open for reading. Keeps the archive alive and closes the entry in its destructor.
	class CZIPStreamReaderEntryFile {
	private:
		PZIPStreamReaderArchive m_pArchive;
		zip_file_t* m_pFile;
		std::string m_sName;

	public:

		CZIPStreamReaderEntryFile(PZIPStreamReaderArchive pArchive, uint64_t nIndex)
			: m_pArchive(pArchive), m_pFile(nullptr)
		{
			m_sName = m_pArchive->getEntryName(nIndex);
			m_pFile = m_pArchive->openEntry(nIndex);
		}

		~CZIPStreamReaderEntryFile()
		{
			if (m_pFile != nullptr)
				m_pArchive->closeEntry(m_pFile);
			m_pFile = nullptr;
		}

		CZIPStreamReaderEntryFile(const CZIPStreamReaderEntryFile&) = delete;
		CZIPStreamReaderEntryFile& operator=(const CZIPStreamReaderEntryFile&) = delete;

		uint64_t read(uint8_t* pBuffer, uint64_t nBufferSize)
		{
			return m_pArchive->readEntry(m_pFile, pBuffer, nBufferSize, m_sName);
		}

	};

} // namespace Impl
} // namespace LibMCEnv


/*************************************************************************************************************************
 Class definition of CZIPEntryExtractor
**************************************************************************************************************************/

CZIPEntryExtractor::CZIPEntryExtractor(PZIPStreamReaderArchive pArchive, const std::string& sEntryName, AMC::WProcessDirectory pProcessDirectory, const std::string& sFileName)
	: m_pArchive(pArchive), m_sEntryName(sEntryName), m_sFileName(sFileName), m_pProcessDirectory(pProcessDirectory),
	m_nEntrySize(0), m_nExtractedBytes(0), m_bFinished(false), m_bFailed(false)
{
	if (pArchive.get() == nullptr)
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_INVALIDPARAM);

	auto pProcessDirectoryInstance = m_pProcessDirectory.lock();
	if (pProcessDirectoryInstance.get() == nullptr)
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_WORKINGDIRECTORYCEASEDTOEXIST);

	// The file name comes from the caller, never from the ZIP entry. It must be a plain file name.
	if (sFileName.empty() || (sFileName.find_first_of(":<>\"/\\|?*") != std::string::npos) || (sFileName.find("..") != std::string::npos))
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_INVALIDWORKINGFILENAME, "invalid working file name: " + sFileName);

	uint64_t nEntryIndex = m_pArchive->findEntry(sEntryName);
	m_nEntrySize = m_pArchive->getEntrySize(nEntryIndex);

	// Fails for an unsupported compression method before any file is created.
	m_pEntryFile = std::make_unique<CZIPStreamReaderEntryFile>(m_pArchive, nEntryIndex);

	m_sAbsoluteFileName = pProcessDirectoryInstance->getAbsoluteFileName(sFileName);
	pProcessDirectoryInstance->addNewMonitoredFile(sFileName);

	m_pOutputStream = std::make_shared<AMCCommon::CExportStream_Native>(m_sAbsoluteFileName);
	m_Buffer.resize((size_t)ZIPSTREAMREADER_READBLOCKSIZE);
}

CZIPEntryExtractor::~CZIPEntryExtractor()
{
	if (!m_bFinished)
		discardPartialFile();
}

void CZIPEntryExtractor::discardPartialFile() noexcept
{
	m_pEntryFile.reset();
	m_pOutputStream.reset();

	if (!m_sAbsoluteFileName.empty()) {
		// The error code is not evaluated: a file that can not be deleted here stays a monitored file of the
		// working directory and is deleted with its clean up.
		std::error_code errorCode;
#ifdef _WIN32
		std::filesystem::remove(std::filesystem::path(AMCCommon::CUtils::UTF8toUTF16(m_sAbsoluteFileName)), errorCode);
#else
		std::filesystem::remove(std::filesystem::path(m_sAbsoluteFileName), errorCode);
#endif
	}
}

bool CZIPEntryExtractor::ExtractChunk(const LibMCEnv_uint64 nMaxBytes)
{
	if (m_bFinished)
		return true;
	if (m_bFailed)
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "extraction of ZIP entry has failed before: " + m_sEntryName);
	if (nMaxBytes == 0)
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_INVALIDPARAM, "ZIP entry extraction needs a chunk size");

	// Any exception below leaves an unusable partial file: delete it during unwinding.
	struct sFailureGuard {
		CZIPEntryExtractor* m_pOwner;
		bool m_bSucceeded;
		~sFailureGuard()
		{
			if (!m_bSucceeded) {
				m_pOwner->m_bFailed = true;
				m_pOwner->discardPartialFile();
			}
		}
	} failureGuard{ this, false };

	uint64_t nBytesInThisCall = 0;
	while (true) {

		// When all bytes are there, one more read lets libzip verify size and CRC.
		bool bAllBytesExtracted = (m_nExtractedBytes >= m_nEntrySize);
		if ((!bAllBytesExtracted) && (nBytesInThisCall >= nMaxBytes))
			break;

		uint64_t nBytesToRead = m_Buffer.size();
		if (!bAllBytesExtracted)
			nBytesToRead = std::min<uint64_t>(nBytesToRead, nMaxBytes - nBytesInThisCall);

		uint64_t nBytesRead = m_pEntryFile->read(m_Buffer.data(), nBytesToRead);
		if (nBytesRead == 0) {
			if (m_nExtractedBytes != m_nEntrySize)
				throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "ZIP entry " + m_sEntryName + " ended after " + std::to_string(m_nExtractedBytes) + " of " + std::to_string(m_nEntrySize) + " bytes");

			m_pEntryFile.reset();
			m_pOutputStream->flushStream();
			m_pOutputStream.reset();
			m_bFinished = true;
			break;
		}

		if (m_nExtractedBytes + nBytesRead > m_nEntrySize)
			throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "ZIP entry " + m_sEntryName + " is larger than its declared size of " + std::to_string(m_nEntrySize) + " bytes");

		try {
			m_pOutputStream->writeBuffer(m_Buffer.data(), nBytesRead);
		}
		catch (const std::exception& E) {
			throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "could not write ZIP entry " + m_sEntryName + " to " + m_sAbsoluteFileName + ": " + E.what());
		}

		m_nExtractedBytes += nBytesRead;
		nBytesInThisCall += nBytesRead;
	}

	failureGuard.m_bSucceeded = true;
	return m_bFinished;
}

LibMCEnv_uint64 CZIPEntryExtractor::GetExtractedBytes()
{
	return m_nExtractedBytes;
}

LibMCEnv_uint64 CZIPEntryExtractor::GetEntrySize()
{
	return m_nEntrySize;
}

bool CZIPEntryExtractor::IsFinished()
{
	return m_bFinished;
}

IWorkingFile* CZIPEntryExtractor::GetWorkingFile()
{
	if (!m_bFinished)
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_ZIPENTRYEXTRACTIONNOTFINISHED, "extraction of ZIP entry has not been finished: " + m_sEntryName);

	return new CWorkingFile(m_sFileName, m_pProcessDirectory);
}


/*************************************************************************************************************************
 Class definition of CZIPStreamReader
**************************************************************************************************************************/

CZIPStreamReader::CZIPStreamReader(LibMCData::PStorageStream pStorageStream)
{
	m_pArchive = std::make_shared<CZIPStreamReaderArchive>(pStorageStream);
}

CZIPStreamReader::~CZIPStreamReader()
{
}

LibMCEnv_uint64 CZIPStreamReader::GetEntryCount()
{
	return m_pArchive->getEntryCount();
}

std::string CZIPStreamReader::GetEntryName(const LibMCEnv_uint64 nIndex)
{
	return m_pArchive->getEntryName(nIndex);
}

LibMCEnv_uint64 CZIPStreamReader::GetEntrySize(const LibMCEnv_uint64 nIndex)
{
	return m_pArchive->getEntrySize(nIndex);
}

bool CZIPStreamReader::HasEntry(const std::string& sName)
{
	return m_pArchive->hasEntry(sName);
}

LibMCEnv_uint64 CZIPStreamReader::GetEntrySizeByName(const std::string& sName)
{
	return m_pArchive->getEntrySize(m_pArchive->findEntry(sName));
}

std::string CZIPStreamReader::ReadEntryAsString(const std::string& sName, const LibMCEnv_uint64 nMaxSize)
{
	uint64_t nEntryIndex = m_pArchive->findEntry(sName);
	uint64_t nEntrySize = m_pArchive->getEntrySize(nEntryIndex);
	if (nEntrySize > nMaxSize)
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_ZIPENTRYTOOLARGE, "ZIP entry " + sName + " has " + std::to_string(nEntrySize) + " bytes, the limit is " + std::to_string(nMaxSize));

	CZIPStreamReaderEntryFile entryFile(m_pArchive, nEntryIndex);

	std::string sContent;
	sContent.resize((size_t)nEntrySize);

	// Reads until libzip reports the end, so that size and CRC are verified.
	uint64_t nTotalBytes = 0;
	uint8_t trailingByte = 0;
	while (true) {
		uint64_t nBytesRead = 0;
		if (nTotalBytes < nEntrySize)
			nBytesRead = entryFile.read((uint8_t*)&sContent[(size_t)nTotalBytes], nEntrySize - nTotalBytes);
		else
			nBytesRead = entryFile.read(&trailingByte, 1);

		if (nBytesRead == 0)
			break;

		if (nTotalBytes >= nEntrySize)
			throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "ZIP entry " + sName + " is larger than its declared size of " + std::to_string(nEntrySize) + " bytes");

		nTotalBytes += nBytesRead;
	}

	if (nTotalBytes != nEntrySize)
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_COULDNOTEXTRACTZIPENTRY, "ZIP entry " + sName + " ended after " + std::to_string(nTotalBytes) + " of " + std::to_string(nEntrySize) + " bytes");

	return sContent;
}

std::string CZIPStreamReader::ReadEntryHead(const std::string& sName, const LibMCEnv_uint64 nMaxBytes)
{
	if (nMaxBytes > ZIPSTREAMREADER_MAXHEADBYTES)
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_INVALIDPARAM, "the head of a ZIP entry is limited to " + std::to_string(ZIPSTREAMREADER_MAXHEADBYTES) + " bytes");

	uint64_t nEntryIndex = m_pArchive->findEntry(sName);
	uint64_t nEntrySize = m_pArchive->getEntrySize(nEntryIndex);

	// Opening the entry checks its compression method, also for an empty head.
	CZIPStreamReaderEntryFile entryFile(m_pArchive, nEntryIndex);

	uint64_t nBytesToRead = std::min<uint64_t>(nMaxBytes, nEntrySize);

	std::string sContent;
	sContent.resize((size_t)nBytesToRead);

	uint64_t nTotalBytes = 0;
	while (nTotalBytes < nBytesToRead) {
		uint64_t nBytesRead = entryFile.read((uint8_t*)&sContent[(size_t)nTotalBytes], nBytesToRead - nTotalBytes);
		if (nBytesRead == 0)
			break;

		nTotalBytes += nBytesRead;
	}

	sContent.resize((size_t)nTotalBytes);
	return sContent;
}

IZIPEntryExtractor* CZIPStreamReader::CreateEntryExtractor(const std::string& sName, IWorkingDirectory* pWorkingDirectory, const std::string& sFileName)
{
	auto pWorkingDirectoryInstance = dynamic_cast<CWorkingDirectory*>(pWorkingDirectory);
	if (pWorkingDirectoryInstance == nullptr)
		throw ELibMCEnvInterfaceException(LIBMCENV_ERROR_INVALIDCAST);

	return new CZIPEntryExtractor(m_pArchive, sName, pWorkingDirectoryInstance->getProcessDirectory(), sFileName);
}
