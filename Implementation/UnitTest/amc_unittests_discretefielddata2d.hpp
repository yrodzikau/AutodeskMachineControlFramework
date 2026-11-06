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

#ifndef __AMCTEST_UNITTEST_DISCRETEFIELDDATA2D
#define __AMCTEST_UNITTEST_DISCRETEFIELDDATA2D


#include "amc_unittests.hpp"
#include "amc_discretefielddata2d.hpp"
#include "libmcenv_interfaceexception.hpp"

#include <cmath>
#include <limits>
#include <vector>


namespace AMCUnitTest {

	class CUnitTestGroup_DiscreteFieldData2D : public CUnitTestGroup {
	public:

		std::string getTestGroupName() override {
			return "DiscreteFieldData2D";
		}

		void registerTests() override {
			registerTest("ConstructionAndBasics", "Discrete field construction and basic properties", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_DiscreteFieldData2D::testConstructionAndBasics, this));
			registerTest("ResizeClampAndPixels", "Discrete field resizing, clamping, and pixel access", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_DiscreteFieldData2D::testResizeClampAndPixels, this));
			registerTest("ScalingAndTransform", "Discrete field scaling and transform operations", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_DiscreteFieldData2D::testScalingAndTransform, this));
			registerTest("DuplicateAndAdd", "Discrete field duplication and add operations", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_DiscreteFieldData2D::testDuplicateAndAdd, this));
			registerTest("RenderAndSampling", "Discrete field rendering and sampling operations", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_DiscreteFieldData2D::testRenderAndSampling, this));
			registerTest("SerializationAndLoad", "Discrete field serialization and raw pixel loading", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_DiscreteFieldData2D::testSerializationAndLoad, this));
			registerTest("NotImplementedPaths", "Discrete field pixel range and not implemented paths", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_DiscreteFieldData2D::testNotImplementedPaths, this));
			registerTest("RectangleSampling", "Discrete field rectangle area sampling", eUnitTestCategory::utMandatoryPass, std::bind(&CUnitTestGroup_DiscreteFieldData2D::testRectangleSampling, this));
		}

		void initializeTests() override {
		}

	private:

		bool nearlyEqual(const double a, const double b, const double epsilon = 1.0e-9)
		{
			return std::abs(a - b) < epsilon;
		}

		// Error code of the LibMCEnv exception a call throws, 0 if it does not throw.
		template <typename F>
		int32_t errorCodeOf(F&& fn)
		{
			try {
				fn();
			}
			catch (ELibMCEnvInterfaceException& envException) {
				return envException.getErrorCode();
			}
			return 0;
		}

		void testConstructionAndBasics()
		{
			bool thrown = false;
			try {
				AMC::CDiscreteFieldData2DInstance invalidField(0, 1, 1.0, 1.0, 0.0, 0.0, 0.0, true);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected constructor to reject zero pixel count");

			thrown = false;
			try {
				AMC::CDiscreteFieldData2DInstance invalidField(1, 1, 0.0, 1.0, 0.0, 0.0, 0.0, true);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected constructor to reject invalid DPI");

			thrown = false;
			try {
				AMC::CDiscreteFieldData2DInstance invalidField(1, 1, 1.0, 1.0, 1.0e10, 0.0, 0.0, true);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected constructor to reject origin out of range");

			AMC::CDiscreteFieldData2DInstance field(2, 3, 25.4, 25.4, 1.0, 2.0, 7.0, true);
			double dpiX = 0.0, dpiY = 0.0;
			field.GetDPI(dpiX, dpiY);
			assertTrue(nearlyEqual(dpiX, 25.4));
			assertTrue(nearlyEqual(dpiY, 25.4));

			double originX = 0.0, originY = 0.0;
			field.GetOriginInMM(originX, originY);
			assertTrue(nearlyEqual(originX, 1.0));
			assertTrue(nearlyEqual(originY, 2.0));

			double sizeX = 0.0, sizeY = 0.0;
			field.GetSizeInMM(sizeX, sizeY);
			assertTrue(nearlyEqual(sizeX, 2.0));
			assertTrue(nearlyEqual(sizeY, 3.0));

			uint32_t sizeXPix = 0, sizeYPix = 0;
			field.GetSizeInPixels(sizeXPix, sizeYPix);
			assertTrue(sizeXPix == 2);
			assertTrue(sizeYPix == 3);

			assertTrue(nearlyEqual(field.GetPixel(0, 0), 7.0));

			field.SetDPI(50.0, 100.0);
			field.GetDPI(dpiX, dpiY);
			assertTrue(nearlyEqual(dpiX, 50.0));
			assertTrue(nearlyEqual(dpiY, 100.0));

			field.SetOriginInMM(-1.0, -2.0);
			field.GetOriginInMM(originX, originY);
			assertTrue(nearlyEqual(originX, -1.0));
			assertTrue(nearlyEqual(originY, -2.0));

			thrown = false;
			try {
				field.SetDPI(0.0, 1.0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected SetDPI to reject invalid values");
		}

		void testResizeClampAndPixels()
		{
			AMC::CDiscreteFieldData2DInstance field(2, 2, 25.4, 25.4, 0.0, 0.0, 0.0, true);
			field.SetPixel(0, 0, 1.0);
			field.SetPixel(1, 0, 2.0);
			field.SetPixel(0, 1, 3.0);
			field.SetPixel(1, 1, 4.0);

			assertTrue(nearlyEqual(field.GetPixel(1, 1), 4.0));

			bool thrown = false;
			try {
				field.GetPixel(2, 0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected GetPixel to reject invalid X coordinate");

			thrown = false;
			try {
				field.SetPixel(0, 3, 1.0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected SetPixel to reject invalid Y coordinate");

			thrown = false;
			try {
				field.Clamp(1.0, 1.0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected Clamp to reject invalid range");

			field.Clamp(0.0, 3.0);
			assertTrue(nearlyEqual(field.GetPixel(1, 1), 3.0));

			uint32_t newX = 3;
			uint32_t newY = 1;
			field.ResizeField(newX, newY, 5.0);
			uint32_t sizeX = 0, sizeY = 0;
			field.GetSizeInPixels(sizeX, sizeY);
			assertTrue(sizeX == 3);
			assertTrue(sizeY == 1);
			assertTrue(nearlyEqual(field.GetPixel(0, 0), 1.0));
			assertTrue(nearlyEqual(field.GetPixel(1, 0), 2.0));
			assertTrue(nearlyEqual(field.GetPixel(2, 0), 5.0));
		}

		void testScalingAndTransform()
		{
			AMC::CDiscreteFieldData2DInstance field(2, 2, 25.4, 25.4, 0.0, 0.0, 0.0, true);
			field.SetPixel(0, 0, 1.0);
			field.SetPixel(1, 0, 2.0);
			field.SetPixel(0, 1, 3.0);
			field.SetPixel(1, 1, 4.0);

			bool thrown = false;
			try {
				field.ScaleFieldDown(0, 1);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected ScaleFieldDown to reject invalid factors");

			auto scaledDown = field.ScaleFieldDown(2, 2);
			uint32_t sizeX = 0, sizeY = 0;
			scaledDown->GetSizeInPixels(sizeX, sizeY);
			assertTrue(sizeX == 1);
			assertTrue(sizeY == 1);
			assertTrue(nearlyEqual(scaledDown->GetPixel(0, 0), 2.5));

			thrown = false;
			try {
				field.ScaleFieldUp(0, 1);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected ScaleFieldUp to reject invalid factors");

			auto scaledUp = field.ScaleFieldUp(2, 2);
			scaledUp->GetSizeInPixels(sizeX, sizeY);
			assertTrue(sizeX == 4);
			assertTrue(sizeY == 4);
			assertTrue(nearlyEqual(scaledUp->GetPixel(0, 0), 1.0));
			assertTrue(nearlyEqual(scaledUp->GetPixel(1, 0), 1.0));
			assertTrue(nearlyEqual(scaledUp->GetPixel(2, 0), 2.0));
			assertTrue(nearlyEqual(scaledUp->GetPixel(3, 0), 2.0));
			assertTrue(nearlyEqual(scaledUp->GetPixel(0, 1), 1.0));
			assertTrue(nearlyEqual(scaledUp->GetPixel(2, 1), 2.0));
			assertTrue(nearlyEqual(scaledUp->GetPixel(0, 2), 3.0));
			assertTrue(nearlyEqual(scaledUp->GetPixel(2, 2), 4.0));

			field.TransformField(2.0, 1.0);
			assertTrue(nearlyEqual(field.GetPixel(0, 0), 3.0));
			assertTrue(nearlyEqual(field.GetPixel(1, 1), 9.0));
		}

		void testDuplicateAndAdd()
		{
			AMC::CDiscreteFieldData2DInstance field(2, 2, 25.4, 25.4, 0.0, 0.0, 0.0, true);
			field.SetPixel(0, 0, 1.0);
			field.SetPixel(1, 0, 2.0);
			field.SetPixel(0, 1, 3.0);
			field.SetPixel(1, 1, 4.0);

			auto duplicate = field.Duplicate();
			assertTrue(duplicate.get() != nullptr);
			assertTrue(duplicate.get() != &field);
			assertTrue(nearlyEqual(duplicate->GetPixel(1, 1), 4.0));

			bool thrown = false;
			try {
				field.AddField(nullptr, 1.0, 0.0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected AddField to reject null input");

			AMC::CDiscreteFieldData2DInstance other(3, 2, 25.4, 25.4, 0.0, 0.0, 0.0, true);
			thrown = false;
			try {
				field.AddField(&other, 1.0, 0.0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected AddField to reject mismatched sizes");

			AMC::CDiscreteFieldData2DInstance same(2, 2, 25.4, 25.4, 0.0, 0.0, 0.0, true);
			same.SetPixel(0, 0, 10.0);
			field.AddField(&same, 0.5, 1.0);
			assertTrue(nearlyEqual(field.GetPixel(0, 0), 1.0 + 10.0 * 0.5 + 1.0));
		}

		void testRenderAndSampling()
		{
			AMC::CDiscreteFieldData2DInstance field(3, 1, 25.4, 25.4, 0.0, 0.0, 0.0, true);
			field.SetPixel(0, 0, 0.0);
			field.SetPixel(1, 0, 0.5);
			field.SetPixel(2, 0, 1.0);

			bool thrown = false;
			try {
				field.renderRGBImage(nullptr, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 2.0, 1.0, 1.0, 1.0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected renderRGBImage to reject null output buffer");

			std::vector<uint8_t> pixels;
			field.renderRGBImage(&pixels, 0.0, 0.0, 0.0, 0.0, 0.5, 0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 1.0);
			assertTrue(pixels.size() == 9);
			assertTrue(pixels.at(0) == 0);
			assertTrue(pixels.at(1) == 0);
			assertTrue(pixels.at(2) == 0);
			assertTrue(pixels.at(3) == 128);
			assertTrue(pixels.at(4) == 128);
			assertTrue(pixels.at(5) == 128);
			assertTrue(pixels.at(6) == 255);
			assertTrue(pixels.at(7) == 255);
			assertTrue(pixels.at(8) == 255);

			thrown = false;
			try {
				field.renderRGBImage(&pixels, 1.0, 0.0, 0.0, 0.0, 0.5, 0.5, 0.5, 0.5, 0.0, 1.0, 1.0, 1.0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected renderRGBImage to reject invalid color range");

			AMC::CDiscreteFieldData2DInstance samplingField(2, 2, 25.4, 25.4, 0.0, 0.0, 0.0, true);
			LibMCEnv::sFieldData2DPoint points[3];
			points[0].m_Coordinates[0] = 0.2;
			points[0].m_Coordinates[1] = 0.2;
			points[0].m_Value = 2.0;
			points[1].m_Coordinates[0] = 0.8;
			points[1].m_Coordinates[1] = 0.8;
			points[1].m_Value = 4.0;
			points[2].m_Coordinates[0] = 1.2;
			points[2].m_Coordinates[1] = 0.2;
			points[2].m_Value = 6.0;
			samplingField.renderAveragePointValues_FloorSampling(-1.0, 3, points);
			assertTrue(nearlyEqual(samplingField.GetPixel(0, 0), 3.0));
			assertTrue(nearlyEqual(samplingField.GetPixel(1, 0), 6.0));
			assertTrue(nearlyEqual(samplingField.GetPixel(0, 1), -1.0));
			assertTrue(nearlyEqual(samplingField.GetPixel(1, 1), -1.0));

			samplingField.SetPixel(0, 0, 9.0);
			samplingField.renderAveragePointValues_FloorSampling(7.0, 0, nullptr);
			assertTrue(nearlyEqual(samplingField.GetPixel(0, 0), 7.0));

			thrown = false;
			try {
				samplingField.renderAveragePointValues_FloorSampling(0.0, 1, nullptr);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected renderAveragePointValues_FloorSampling to reject null input");
		}

		void testSerializationAndLoad()
		{
			AMC::CDiscreteFieldData2DInstance field(2, 2, 10.0, 20.0, 1.0, 2.0, 0.0, true);
			field.SetPixel(0, 0, 1.0);
			field.SetPixel(1, 0, 2.0);
			field.SetPixel(0, 1, 3.0);
			field.SetPixel(1, 1, 4.0);

			std::vector<uint8_t> buffer;
			field.saveToBuffer(buffer);
			auto loaded = AMC::CDiscreteFieldData2DInstance::createFromBuffer(buffer);
			uint32_t sizeX = 0, sizeY = 0;
			loaded->GetSizeInPixels(sizeX, sizeY);
			assertTrue(sizeX == 2);
			assertTrue(sizeY == 2);

			double dpiX = 0.0, dpiY = 0.0;
			loaded->GetDPI(dpiX, dpiY);
			assertTrue(nearlyEqual(dpiX, 10.0));
			assertTrue(nearlyEqual(dpiY, 20.0));

			double originX = 0.0, originY = 0.0;
			loaded->GetOriginInMM(originX, originY);
			assertTrue(nearlyEqual(originX, 1.0));
			assertTrue(nearlyEqual(originY, 2.0));
			assertTrue(nearlyEqual(loaded->GetPixel(1, 1), 4.0));

			bool thrown = false;
			try {
				std::vector<uint8_t> tiny;
				AMC::CDiscreteFieldData2DInstance::createFromBuffer(tiny);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected createFromBuffer to reject empty buffer");

			thrown = false;
			try {
				std::vector<uint8_t> corrupted = buffer;
				if (corrupted.size() > 0)
					corrupted[0] = 0;
				AMC::CDiscreteFieldData2DInstance::createFromBuffer(corrupted);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected createFromBuffer to reject invalid signature");

			AMC::CDiscreteFieldData2DInstance pixelField(2, 2, 25.4, 25.4, 0.0, 0.0, 0.0, true);
			std::vector<uint8_t> grayData = { 0, 255, 128, 64 };
			pixelField.loadFromRawPixelData(grayData, LibMCEnv::eImagePixelFormat::GreyScale8bit, 0.0, 1.0);
			assertTrue(nearlyEqual(pixelField.GetPixel(0, 0), 0.0));
			assertTrue(nearlyEqual(pixelField.GetPixel(1, 0), 1.0));

			std::vector<uint8_t> rgbData = {
				0, 0, 0,
				255, 255, 255,
				255, 0, 0,
				0, 255, 0
			};
			pixelField.loadFromRawPixelData(rgbData, LibMCEnv::eImagePixelFormat::RGB24bit, 0.0, 1.0);
			assertTrue(nearlyEqual(pixelField.GetPixel(0, 0), 0.0));
			assertTrue(nearlyEqual(pixelField.GetPixel(1, 0), 1.0));

			std::vector<uint8_t> rgbaData = {
				0, 0, 0, 255,
				255, 255, 255, 255,
				255, 0, 0, 255,
				0, 255, 0, 255
			};
			pixelField.loadFromRawPixelData(rgbaData, LibMCEnv::eImagePixelFormat::RGBA32bit, 0.0, 1.0);
			assertTrue(nearlyEqual(pixelField.GetPixel(0, 0), 0.0));
			assertTrue(nearlyEqual(pixelField.GetPixel(1, 0), 1.0));

			thrown = false;
			try {
				pixelField.loadFromRawPixelData(grayData, LibMCEnv::eImagePixelFormat::RGB24bit, 0.0, 1.0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected loadFromRawPixelData to reject mismatched buffer size");

			thrown = false;
			try {
				pixelField.loadFromRawPixelData(grayData, LibMCEnv::eImagePixelFormat::Unknown, 0.0, 1.0);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected loadFromRawPixelData to reject unknown pixel format");
		}

		void testNotImplementedPaths()
		{
			AMC::CDiscreteFieldData2DInstance field(2, 2, 25.4, 25.4, 0.0, 0.0, 0.0, true);
			field.SetPixel(0, 0, 1.0);
			field.SetPixel(1, 0, 2.0);
			field.SetPixel(0, 1, 3.0);
			field.SetPixel(1, 1, 4.0);

			// GetPixelRange is implemented: the first call reports the needed count, the second one fills the buffer row-wise.
			uint64_t nNeeded = 0;
			field.GetPixelRange(0, 0, 1, 1, 0, &nNeeded, nullptr);
			assertTrue(nNeeded == 4, "Expected GetPixelRange to report four values for a 2 x 2 range");
			std::vector<double> values(4, 0.0);
			field.GetPixelRange(0, 0, 1, 1, values.size(), nullptr, values.data());
			assertTrue(nearlyEqual(values[0], 1.0) && nearlyEqual(values[1], 2.0) && nearlyEqual(values[2], 3.0) && nearlyEqual(values[3], 4.0), "Expected GetPixelRange to return the field row-wise");

			field.GetPixelRange(1, 0, 1, 1, 0, &nNeeded, nullptr);
			assertTrue(nNeeded == 2, "Expected GetPixelRange to report two values for a single column");
			std::vector<double> column(2, 0.0);
			field.GetPixelRange(1, 0, 1, 1, column.size(), nullptr, column.data());
			assertTrue(nearlyEqual(column[0], 2.0) && nearlyEqual(column[1], 4.0), "Expected GetPixelRange to return a column top down");

			assertTrue(errorCodeOf([&]() { field.GetPixelRange(0, 0, 2, 1, 0, &nNeeded, nullptr); }) == LIBMCENV_ERROR_INVALIDXCOORDINATE, "Expected GetPixelRange to reject a range outside of the field");
			assertTrue(errorCodeOf([&]() { field.GetPixelRange(1, 0, 0, 1, 0, &nNeeded, nullptr); }) == LIBMCENV_ERROR_INVALIDXCOORDINATE, "Expected GetPixelRange to reject XMin above XMax");
			assertTrue(errorCodeOf([&]() { field.GetPixelRange(0, 1, 1, 0, 0, &nNeeded, nullptr); }) == LIBMCENV_ERROR_INVALIDYCOORDINATE, "Expected GetPixelRange to reject YMin above YMax");
			std::vector<double> tooSmall(2, 0.0);
			assertTrue(errorCodeOf([&]() { field.GetPixelRange(0, 0, 1, 1, tooSmall.size(), nullptr, tooSmall.data()); }) == LIBMCENV_ERROR_BUFFERTOOSMALL, "Expected GetPixelRange to reject a buffer that is too small");

			bool thrown = false;
			try {
				field.SetPixelRange(0, 0, 1, 1, 0, nullptr);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected SetPixelRange to throw not implemented");

			thrown = false;
			try {
				field.DiscretizeWithMapping(0, nullptr, 0, nullptr);
			}
			catch (...) {
				thrown = true;
			}
			assertTrue(thrown, "Expected DiscretizeWithMapping to throw not implemented");
		}

		void testRectangleSampling()
		{
			// 4 x 4 field, one pixel per mm, origin 0: pixel coordinates equal mm coordinates.
			AMC::CDiscreteFieldData2DInstance field(4, 4, 25.4, 25.4, 0.0, 0.0, 0.0, true);

			// A point on the junction of four pixels with a 2 x 2 footprint lands in all four with equal weight.
			LibMCEnv::sFieldData2DPoint junction[1];
			junction[0].m_Coordinates[0] = 2.0;
			junction[0].m_Coordinates[1] = 2.0;
			junction[0].m_Value = 8.0;
			field.renderAveragePointValues_RectangleSampling(-1.0, 2.0, 2.0, 1, junction);
			assertTrue(nearlyEqual(field.GetPixel(1, 1), 8.0), "Expected the four pixels of the junction to hold the value");
			assertTrue(nearlyEqual(field.GetPixel(2, 1), 8.0), "Expected the four pixels of the junction to hold the value");
			assertTrue(nearlyEqual(field.GetPixel(1, 2), 8.0), "Expected the four pixels of the junction to hold the value");
			assertTrue(nearlyEqual(field.GetPixel(2, 2), 8.0), "Expected the four pixels of the junction to hold the value");
			assertTrue(nearlyEqual(field.GetPixel(0, 0), -1.0), "Expected pixels without overlap to hold the default value");
			assertTrue(nearlyEqual(field.GetPixel(3, 3), -1.0), "Expected pixels without overlap to hold the default value");
			assertTrue(nearlyEqual(field.GetPixel(0, 1), -1.0), "Expected pixels without overlap to hold the default value");

			// A footprint of half a pixel inside one pixel: that pixel gets the exact value, the neighbours nothing.
			LibMCEnv::sFieldData2DPoint inside[1];
			inside[0].m_Coordinates[0] = 0.5;
			inside[0].m_Coordinates[1] = 0.5;
			inside[0].m_Value = 3.0;
			field.renderAveragePointValues_RectangleSampling(-1.0, 0.5, 0.5, 1, inside);
			assertTrue(nearlyEqual(field.GetPixel(0, 0), 3.0), "Expected a sub-pixel footprint to land in the pixel that holds the point");
			assertTrue(nearlyEqual(field.GetPixel(1, 0), -1.0), "Expected a sub-pixel footprint inside a pixel to leave the neighbour alone");
			assertTrue(nearlyEqual(field.GetPixel(0, 1), -1.0), "Expected a sub-pixel footprint inside a pixel to leave the neighbour alone");

			// A footprint of half a pixel across a border (centre at 0.9) covers 0.65..1.15: pixel 0 with 0.35 and pixel 1
			// with 0.15 of its width. Alone, both pixels get the value; a second point in pixel 1 shows the weights.
			LibMCEnv::sFieldData2DPoint border[2];
			border[0].m_Coordinates[0] = 0.9;
			border[0].m_Coordinates[1] = 0.5;
			border[0].m_Value = 10.0;
			border[1].m_Coordinates[0] = 1.5;
			border[1].m_Coordinates[1] = 0.5;
			border[1].m_Value = 0.0;
			field.renderAveragePointValues_RectangleSampling(-1.0, 0.5, 0.5, 1, border);
			assertTrue(nearlyEqual(field.GetPixel(0, 0), 10.0), "Expected a footprint across a border to reach the pixel of the point");
			assertTrue(nearlyEqual(field.GetPixel(1, 0), 10.0), "Expected a footprint across a border to reach the neighbouring pixel");
			assertTrue(nearlyEqual(field.GetPixel(2, 0), -1.0), "Expected a footprint across a border to stop at the neighbouring pixel");
			field.renderAveragePointValues_RectangleSampling(-1.0, 0.5, 0.5, 2, border);
			double dExpectedBorderValue = (0.15 * 0.5 * 10.0 + 0.5 * 0.5 * 0.0) / (0.15 * 0.5 + 0.5 * 0.5);
			assertTrue(nearlyEqual(field.GetPixel(0, 0), 10.0), "Expected the pixel of the first point to keep its value");
			assertTrue(nearlyEqual(field.GetPixel(1, 0), dExpectedBorderValue), "Expected the overlap areas to weight the values of the shared pixel");

			// A footprint over the edge of the field is clipped, a footprint entirely outside is ignored, no exception.
			LibMCEnv::sFieldData2DPoint edge[2];
			edge[0].m_Coordinates[0] = 0.0;
			edge[0].m_Coordinates[1] = 0.0;
			edge[0].m_Value = 5.0;
			edge[1].m_Coordinates[0] = -100.0;
			edge[1].m_Coordinates[1] = 7.0;
			edge[1].m_Value = 9.0;
			field.renderAveragePointValues_RectangleSampling(-1.0, 2.0, 2.0, 2, edge);
			assertTrue(nearlyEqual(field.GetPixel(0, 0), 5.0), "Expected a footprint over the edge to be clipped to the field");
			assertTrue(nearlyEqual(field.GetPixel(1, 0), -1.0), "Expected a clipped footprint to stop at its border");
			assertTrue(nearlyEqual(field.GetPixel(0, 1), -1.0), "Expected a clipped footprint to stop at its border");
			assertTrue(nearlyEqual(field.GetPixel(3, 3), -1.0), "Expected a footprint outside of the field to be ignored");

			// Two overlapping footprints: the pixel they share holds the weighted average.
			LibMCEnv::sFieldData2DPoint overlapping[2];
			overlapping[0].m_Coordinates[0] = 1.5;
			overlapping[0].m_Coordinates[1] = 1.5;
			overlapping[0].m_Value = 2.0;
			overlapping[1].m_Coordinates[0] = 2.0;
			overlapping[1].m_Coordinates[1] = 1.5;
			overlapping[1].m_Value = 6.0;
			field.renderAveragePointValues_RectangleSampling(-1.0, 1.0, 1.0, 2, overlapping);
			assertTrue(nearlyEqual(field.GetPixel(1, 1), (2.0 * 1.0 + 6.0 * 0.5) / 1.5), "Expected the shared pixel to hold the weighted average");
			assertTrue(nearlyEqual(field.GetPixel(2, 1), 6.0), "Expected the pixel of the second point alone to hold its value");
			assertTrue(nearlyEqual(field.GetPixel(0, 1), -1.0), "Expected the pixel next to the footprints to hold the default value");

			// The footprint has to be positive (IDL): zero, negative and NaN sizes are rejected, not clamped.
			assertTrue(errorCodeOf([&]() { field.renderAveragePointValues_RectangleSampling(0.0, 0.0, 1.0, 1, inside); }) == LIBMCENV_ERROR_INVALIDPARAM, "Expected a zero footprint to be rejected");
			assertTrue(errorCodeOf([&]() { field.renderAveragePointValues_RectangleSampling(0.0, 1.0, -0.5, 1, inside); }) == LIBMCENV_ERROR_INVALIDPARAM, "Expected a negative footprint to be rejected");
			assertTrue(errorCodeOf([&]() { field.renderAveragePointValues_RectangleSampling(0.0, std::numeric_limits<double>::quiet_NaN(), 1.0, 1, inside); }) == LIBMCENV_ERROR_INVALIDPARAM, "Expected a NaN footprint to be rejected");
			assertTrue(errorCodeOf([&]() { field.renderAveragePointValues_RectangleSampling(0.0, 1.0, 1.0, 1, nullptr); }) == LIBMCENV_ERROR_INVALIDPARAM, "Expected a null point buffer to be rejected");

			// An empty point array fills the field with the default value.
			field.renderAveragePointValues_RectangleSampling(7.0, 1.0, 1.0, 0, nullptr);
			assertTrue(nearlyEqual(field.GetPixel(0, 0), 7.0), "Expected an empty point array to clear the field to the default value");
			assertTrue(nearlyEqual(field.GetPixel(3, 3), 7.0), "Expected an empty point array to clear the field to the default value");
		}
	};

}

#endif // __AMCTEST_UNITTEST_DISCRETEFIELDDATA2D
