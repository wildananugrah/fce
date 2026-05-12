### Task: /webhook/brand-brain enhancement

**Desription:**
Enhance /webhook/brand-brain tambah field references yang dimana sifat-nya opsional.
Isi dari field tersebut adalah array of object: 

```json
"references" : [
    {
      "link": "[pdf-link]",
      "type" : "pdf"
    },
    {
      "link": "[image-link]",
      "type" : "image"
    },
    {
      "link": "[video-link]",
      "type" : "video"
    }
  ]
```

**Examples:**
```json
### request
POST {{host}}/webhook/brand-brain
Content-Type: application/json
Authorization-fce: f47ac10b-58cc-4372-a567-0e02b2c3d479

{
  "url": "https://www.bcalife.co.id/",
  "language" : "chinese",
  "references" : [
    {
      "link": "[pdf-link]",
      "type" : "pdf"
    },
    {
      "link": "[image-link]",
      "type" : "image"
    },
    {
      "link": "[video-link]",
      "type" : "video"
    }
  ]
}

### response:
HTTP/1.1 200 OK

{
  "jobId": "e01dede7-2d9c-48ab-a935-5dae278ccdf6"
}
```

