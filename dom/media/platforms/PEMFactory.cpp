/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PEMFactory.h"

#ifdef MOZ_APPLEMEDIA
#  include "AppleEncoderModule.h"
#endif

#ifdef MOZ_WIDGET_ANDROID
#  include "AndroidEncoderModule.h"
#endif

#ifdef XP_WIN
#  include "WMFEncoderModule.h"
#endif

#ifdef MOZ_FFVPX
#  include "FFVPXRuntimeLinker.h"
#endif
#ifdef MOZ_FFMPEG
#  include "FFmpegRuntimeLinker.h"
#endif

#include "mozilla/StaticPrefs_media.h"
#include "mozilla/gfx/gfxVars.h"

namespace mozilla {

LazyLogModule sPEMLog("PlatformEncoderModule");

PEMFactory::PEMFactory() {
  gfx::gfxVars::Initialize();
#ifdef MOZ_APPLEMEDIA
  RefPtr<PlatformEncoderModule> m(new AppleEncoderModule());
  mModules.AppendElement(m);
#endif

#ifdef MOZ_WIDGET_ANDROID
  mModules.AppendElement(new AndroidEncoderModule());
#endif

#ifdef XP_WIN
  mModules.AppendElement(new WMFEncoderModule());
#endif

#ifdef MOZ_FFVPX
  if (StaticPrefs::media_ffvpx_enabled() &&
      StaticPrefs::media_ffmpeg_encoder_enabled()) {
    if (RefPtr<PlatformEncoderModule> pem =
            FFVPXRuntimeLinker::CreateEncoder()) {
      mModules.AppendElement(pem);
    }
  }
#endif

#ifdef MOZ_FFMPEG
  if (StaticPrefs::media_ffmpeg_enabled() &&
      StaticPrefs::media_ffmpeg_encoder_enabled()) {
    if (RefPtr<PlatformEncoderModule> pem =
            FFmpegRuntimeLinker::CreateEncoder()) {
      mModules.AppendElement(pem);
    }
  }
#endif
}

bool PEMFactory::SupportsMimeType(const nsACString& aMimeType) const {
  for (auto m : mModules) {
    if (m->SupportsMimeType(aMimeType)) {
      return true;
    }
  }
  return false;
}

already_AddRefed<MediaDataEncoder> PEMFactory::CreateEncoder(
    const CreateEncoderParams& aParams, const bool aHardwareNotAllowed) {
  const TrackInfo& info = aParams.mConfig;
  RefPtr<PlatformEncoderModule> m = FindPEM(info);
  if (!m) {
    return nullptr;
  }

  return info.IsVideo() ? m->CreateVideoEncoder(aParams, aHardwareNotAllowed)
                        : nullptr;
}

already_AddRefed<PlatformEncoderModule> PEMFactory::FindPEM(
    const TrackInfo& aTrackInfo) const {
  RefPtr<PlatformEncoderModule> found;
  for (auto m : mModules) {
    if (m->SupportsMimeType(aTrackInfo.mMimeType)) {
      found = m;
      break;
    }
  }

  return found.forget();
}

}  // namespace mozilla
