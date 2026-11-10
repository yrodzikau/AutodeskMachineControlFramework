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


Abstract: This is the class declaration of CZIPStreamReader and CZIPEntryExtractor

*/


#ifndef __LIBMCENV_ZIPSTREAMREADER
#define __LIBMCENV_ZIPSTREAMREADER

#include "libmcenv_interfaces.hpp"

// Parent classes
#include "libmcenv_base.hpp"
#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable : 4250)
#endif

// Include custom headers here.
#include "libmcdata_dynamic.hpp"
#include "amc_processdirectory.hpp"
#include "Common/common_exportstream_native.hpp"

#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace LibMCEnv {
namespace Impl {

	class CZIPStreamReaderArchive;
	typedef std::shared_ptr<CZIPStreamReaderArchive> PZIPStreamReaderArchive;

	class CZIPStreamReaderEntryFile;


	/*************************************************************************************************************************
	 Class declaration of CZIPEntryExtractor
	**************************************************************************************************************************/

	class CZIPEntryExtractor : public virtual IZIPEntryExtractor, public virtual CBase {
	private:

		// The archive MUST outlive the open entry file.
		PZIPStreamReaderArchive m_pArchive;
		std::unique_ptr<CZIPStreamReaderEntryFile> m_pEntryFile;

		std::string m_sEntryName;
		std::string m_sFileName;
		std::string m_sAbsoluteFileName;
		AMC::WProcessDirectory m_pProcessDirectory;

		AMCCommon::PExportStream_Native m_pOutputStream;
		std::vector<uint8_t> m_Buffer;

		uint64_t m_nEntrySize;
		uint64_t m_nExtractedBytes;
		bool m_bFinished;
		bool m_bFailed;

		// Closes the entry and the output file and deletes the partial file. Never throws.
		void discardPartialFile() noexcept;

	public:

		CZIPEntryExtractor(PZIPStreamReaderArchive pArchive, const std::string& sEntryName, AMC::WProcessDirectory pProcessDirectory, const std::string& sFileName);

		virtual ~CZIPEntryExtractor();

		bool ExtractChunk(const LibMCEnv_uint64 nMaxBytes) override;

		LibMCEnv_uint64 GetExtractedBytes() override;

		LibMCEnv_uint64 GetEntrySize() override;

		bool IsFinished() override;

		IWorkingFile* GetWorkingFile() override;

	};


	/*************************************************************************************************************************
	 Class declaration of CZIPStreamReader
	**************************************************************************************************************************/

	class CZIPStreamReader : public virtual IZIPStreamReader, public virtual CBase {
	private:

		PZIPStreamReaderArchive m_pArchive;

	public:

		// Opens the ZIP file of a finished storage stream. The stream is kept alive as long as the reader or one of its extractors exists.
		CZIPStreamReader(LibMCData::PStorageStream pStorageStream);

		virtual ~CZIPStreamReader();

		LibMCEnv_uint64 GetEntryCount() override;

		std::string GetEntryName(const LibMCEnv_uint64 nIndex) override;

		LibMCEnv_uint64 GetEntrySize(const LibMCEnv_uint64 nIndex) override;

		bool HasEntry(const std::string& sName) override;

		LibMCEnv_uint64 GetEntrySizeByName(const std::string& sName) override;

		std::string ReadEntryAsString(const std::string& sName, const LibMCEnv_uint64 nMaxSize) override;

		std::string ReadEntryHead(const std::string& sName, const LibMCEnv_uint64 nMaxBytes) override;

		IZIPEntryExtractor* CreateEntryExtractor(const std::string& sName, IWorkingDirectory* pWorkingDirectory, const std::string& sFileName) override;

	};

} // namespace Impl
} // namespace LibMCEnv

#ifdef _MSC_VER
#pragma warning(pop)
#endif
#endif // __LIBMCENV_ZIPSTREAMREADER
