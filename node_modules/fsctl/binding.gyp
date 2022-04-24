{
  "targets": [{
    "target_name": "fsctl_native",
    "include_dirs": [
      "<!(node -e \"require('napi-macros')\")"
    ],
    "sources": [ "./binding.cc" ]
  }]
}

