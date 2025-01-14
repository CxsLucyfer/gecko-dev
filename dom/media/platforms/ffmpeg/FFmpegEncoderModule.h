/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_PLATFORMS_FFMPEG_FFMPEGENCODERMODULE_H_
#define DOM_MEDIA_PLATFORMS_FFMPEG_FFMPEGENCODERMODULE_H_

#include "FFmpegLibWrapper.h"
#include "PlatformEncoderModule.h"

namespace mozilla {

template <int V>
class FFmpegEncoderModule final : public PlatformEncoderModule {
 public:
  static already_AddRefed<PlatformEncoderModule> Create(
      FFmpegLibWrapper* aLib) {
    RefPtr<PlatformEncoderModule> pem = new FFmpegEncoderModule(aLib);
    return pem.forget();
  }

  virtual ~FFmpegEncoderModule() = default;

  /* PlatformEncoderModule Methods */
  bool SupportsMimeType(const nsACString& aMimeType) const override;

  already_AddRefed<MediaDataEncoder> CreateVideoEncoder(
      const CreateEncoderParams& aParams,
      const bool aHardwareNotAllowed) const override;

 protected:
  explicit FFmpegEncoderModule(FFmpegLibWrapper* aLib) : mLib(aLib) {
    MOZ_ASSERT(mLib);
  }

 private:
  // This refers to a static FFmpegLibWrapper, so raw pointer is adequate.
  const FFmpegLibWrapper* mLib;  // set in constructor
};

}  // namespace mozilla

#endif /* DOM_MEDIA_PLATFORMS_FFMPEG_FFMPEGENCODERMODULE_H_ */
