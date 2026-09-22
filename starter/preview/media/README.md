# Designer preview imagery

Place authorised JPEG, PNG or WebP images here, at most 2 MiB each. Reference an image in
your independent author content as `p60preview:filename.jpg`. Configure that JSON content
file through `preview/config.json`, for example `"content": "content.json"`.

These images ship only in the separate designer preview bundle. They never enter the
runtime Liquid/CSS artifact or a tenant's media library. Keep provenance and required
attribution beside your source images. No tenant content or secrets belong here.
