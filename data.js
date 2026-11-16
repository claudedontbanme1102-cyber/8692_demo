/* World4Refiner — 网站数据契约（由 _build_data.py 从 on-disk 台账生成，勿手改）
   来源：report_w4r/_common.py + cf_repair/T37_WM_NAVHARD_REPAIR.json
         + cf_repair/T39_KFOLD_CONCLUSION.json
   规则：只写当前线数字；旧线逐 token 分、61.6678/59.0500 等一律不出现。 */
window.W4R = {
  "cross": [
    {
      "name": "DiffusionDrive",
      "base": 29.38018,
      "ours": 31.912546,
      "d": 2.532367,
      "lo": 1.25,
      "hi": 3.91,
      "harm": 4.43,
      "changed": 2562,
      "up": 1892,
      "down": 327,
      "pool": 21
    },
    {
      "name": "DrivoR-pure",
      "base": 54.05991,
      "ours": 57.238206,
      "d": 3.178296,
      "lo": 1.08,
      "hi": 5.1,
      "harm": 14.56,
      "changed": 3559,
      "up": 2697,
      "down": 284,
      "pool": 64
    },
    {
      "name": "SparseDriveV2",
      "base": 40.482272,
      "ours": 43.940536,
      "d": 3.458264,
      "lo": 1.81,
      "hi": 5.1,
      "harm": 4.53,
      "changed": 3100,
      "up": 2410,
      "down": 139,
      "pool": 200
    },
    {
      "name": "LEAD",
      "base": 31.448196,
      "ours": 33.215239,
      "d": 1.767042,
      "lo": 0.24,
      "hi": 3.54,
      "harm": 8.06,
      "changed": 2831,
      "up": 1667,
      "down": 689,
      "pool": 14
    },
    {
      "name": "ChainFlow-VLA",
      "base": 37.705902,
      "ours": 40.434968,
      "d": 2.729067,
      "lo": 1.13,
      "hi": 4.24,
      "harm": 7.42,
      "changed": 2799,
      "up": 1683,
      "down": 245,
      "pool": 64
    },
    {
      "name": "TOAD (deploy)",
      "base": 58.428564,
      "ours": 59.492699,
      "d": 1.064134,
      "lo": 0.08,
      "hi": 1.96,
      "harm": 8.33,
      "changed": 849,
      "up": 652,
      "down": 88,
      "pool": 34
    }
  ],
  "navtest": {
    "v1": {
      "base": 88.091505,
      "frozen": 83.44116,
      "dnh": 88.585488,
      "dnh2": 88.599258,
      "d_frozen": -4.650344,
      "d_dnh": 0.493983,
      "d_dnh2": 0.507753,
      "lo": 0.299,
      "hi": 0.719,
      "changed": 3744,
      "up": 2757,
      "down": 267
    },
    "v2": {
      "base": 88.490195,
      "frozen": 82.780725,
      "dnh": 87.944124,
      "dnh2": 88.776715,
      "d_frozen": -5.70947,
      "d_dnh": -0.546071,
      "d_dnh2": 0.28652,
      "lo": 0.052,
      "hi": 0.527,
      "changed": 3744,
      "up": 2709,
      "down": 505
    },
    "changed": 3744
  },
  "cf": {
    "arms": [
      {
        "name": "CV8 几何门",
        "name_en": "CV8 geometric gate",
        "fired": 26,
        "rescued": 15,
        "harmed": 0,
        "net": 15,
        "lo": 8.2162,
        "hi": 24.1284,
        "coll_before": 63,
        "coll_after": 48,
        "mean_dprog": -0.0629,
        "n": 76,
        "logs": 14
      },
      {
        "name": "WM 种子0",
        "name_en": "WM seed 0",
        "fired": 24,
        "rescued": 14,
        "harmed": 0,
        "net": 14,
        "lo": 8.0845,
        "hi": 20.5079,
        "coll_before": 63,
        "coll_after": 49,
        "mean_dprog": -0.0347,
        "n": 76,
        "logs": 14
      },
      {
        "name": "WM 种子1",
        "name_en": "WM seed 1",
        "fired": 24,
        "rescued": 13,
        "harmed": 0,
        "net": 13,
        "lo": 7.414,
        "hi": 20.0561,
        "coll_before": 63,
        "coll_after": 50,
        "mean_dprog": -0.0736,
        "n": 76,
        "logs": 14
      }
    ],
    "attribution": {
      "hit": 56,
      "total": 56,
      "acc": 1.0,
      "fired": 24,
      "rescued": 14,
      "harmed": 0,
      "degen": 0
    },
    "pooled": {
      "n": 281,
      "logs": 43,
      "base_coll": 197,
      "seeds": [
        {
          "seed": 20261112,
          "wm_net": 29,
          "wm_rescued": 35,
          "wm_harmed": 6,
          "wm_lo": 11.24,
          "wm_hi": 45.5707,
          "cv_net": 27,
          "cv_harmed": 8,
          "cv_lo": 8.6795,
          "cv_hi": 45.9823
        },
        {
          "seed": 20261113,
          "wm_net": 28,
          "wm_rescued": 34,
          "wm_harmed": 6,
          "wm_lo": 10.725,
          "wm_hi": 44.4241,
          "cv_net": 27,
          "cv_harmed": 8,
          "cv_lo": 9.3667,
          "cv_hi": 45.8792
        }
      ],
      "rescue_rate": 0.1777,
      "harm_rate": 0.0714,
      "honest_boundary": "zero-harm is NOT universal: the single-split t37 val (14 logs) had 0 harm, but pooled out-of-sample over all 43 logs has 6 harms (7.1% of base-clean), concentrated in one date-cluster. The NET positive (+28/+29, CI excludes zero, two seeds) IS robust. The deployable claim is the imminent-conflict substrate, not full navtrain."
    },
    "example": {
      "token": "027609f1",
      "risk": 0.9746,
      "agent": 0,
      "dist": 11.2,
      "onset": 1.0,
      "pen": -0.431,
      "shift": 3.17,
      "dir": "right",
      "new_clear": 0.82,
      "family": "cutinR3.5",
      "prog_before": 38.34,
      "prog_after": 37.66,
      "dprog": -0.683,
      "spd_before": 11.18,
      "spd_after": 11.23
    }
  },
  "editShare": [
    {
      "name": "DiffusionDrive",
      "hold": 2900,
      "edit": 2562,
      "net": 13.504448,
      "frac": 0.9984
    },
    {
      "name": "DrivoR-pure",
      "hold": 1903,
      "edit": 3559,
      "net": 17.013871,
      "frac": 0.9964
    },
    {
      "name": "SparseDriveV2",
      "hold": 2362,
      "edit": 3100,
      "net": 17.873544,
      "frac": 0.9898
    },
    {
      "name": "LEAD",
      "hold": 2631,
      "edit": 2831,
      "net": 9.056682,
      "frac": 0.9793
    },
    {
      "name": "ChainFlow-VLA",
      "hold": 2663,
      "edit": 2799,
      "net": 13.744332,
      "frac": 0.9774
    }
  ],
  "wmCollapse": [
    {
      "name": "DiffusionDrive",
      "corr": 0.999999751,
      "med": 0.0831,
      "rej": 0.0066
    },
    {
      "name": "DrivoR-pure",
      "corr": 0.999999743,
      "med": 0.082,
      "rej": 0.0084
    },
    {
      "name": "SparseDriveV2",
      "corr": 0.999999738,
      "med": 0.0857,
      "rej": 0.0071
    },
    {
      "name": "LEAD",
      "corr": 0.99999974,
      "med": 0.0856,
      "rej": 0.0071
    },
    {
      "name": "ChainFlow-VLA",
      "corr": 0.999999742,
      "med": 0.0858,
      "rej": 0.0076
    }
  ],
  "board": {
    "stage2": 5462,
    "groups": 225,
    "scored": 5296,
    "zero": 949,
    "nan": 166,
    "zero_frac": 0.179
  },
  "weightHist": [
    {
      "label": "1e-1…1e0",
      "n": 837
    },
    {
      "label": "1e-2…1e-1",
      "n": 530
    },
    {
      "label": "1e-3…1e-2",
      "n": 120
    },
    {
      "label": "1e-4…1e-3",
      "n": 90
    },
    {
      "label": "1e-6…1e-4",
      "n": 173
    },
    {
      "label": "1e-8…1e-6",
      "n": 118
    },
    {
      "label": "1e-12…1e-8",
      "n": 234
    },
    {
      "label": "≤1e-12 (incl. 0)",
      "n": 3360
    }
  ],
  "instruments": [
    {
      "key": "navhard",
      "name": "navhard",
      "unit": "combined EPDMS",
      "desc": "两阶段反应式合并 EPDMS；5,912 token / 225 组",
      "desc_en": "two-stage reactive combined EPDMS; 5,912 tokens / 225 groups"
    },
    {
      "key": "navtest-v1",
      "name": "navtest v1",
      "unit": "PDMS",
      "desc": "单阶段非反应式 PDMS；12,146 token",
      "desc_en": "single-stage non-reactive PDMS; 12,146 tokens"
    },
    {
      "key": "navtest-v2",
      "name": "navtest v2",
      "unit": "PDMS",
      "desc": "单阶段反应式 PDMS，含两帧舒适耦合",
      "desc_en": "single-stage reactive PDMS with two-frame comfort coupling"
    }
  ]
};
