/* ==========================================================================
   新民独立中学 (Sin Min Middle School) 2026 运动会核心规则引擎与跨屏数据总线
   兼容 file:// 双击运行与静态服务器部署 (挂载于 window.SinMinSports)
   ========================================================================== */
(function (global) {
  'use strict';

  var STORAGE_STATE_KEY = 'sinmin_sports_2026_state_v4';
  var STORAGE_TV_KEY = 'sinmin_sports_2026_tv_v2';
  var STORAGE_GH_TOKEN_KEY = 'sinmin_sports_2026_gh_token_local';
  var CHANNEL_NAME = 'sinmin_sports_2026';
  var DEFAULT_GITHUB_REPO = 'felixyu9722/sinmin-sports-2026';

  var TEAMS = {
    red: { id: 'red', code: '1', name: '红队', enName: 'RED HOUSE', color: '#ff2a4b', soft: 'rgba(255,42,75,0.16)' },
    yellow: { id: 'yellow', code: '2', name: '黄队', enName: 'YELLOW HOUSE', color: '#ffc700', soft: 'rgba(255,199,0,0.16)' },
    blue: { id: 'blue', code: '3', name: '蓝队', enName: 'BLUE HOUSE', color: '#2979ff', soft: 'rgba(41,121,255,0.16)' },
    green: { id: 'green', code: '4', name: '青队', enName: 'GREEN HOUSE', color: '#00e676', soft: 'rgba(0,230,118,0.16)' }
  };

  var TEAM_ORDER = ['red', 'yellow', 'blue', 'green'];

  // 章程第 13 & 14 条：组别代码与统一白底号码布（内含队伍色点）
  var GROUPS = {
    '男甲': { code: '1', label: '男甲', division: '高中', fullName: '男子甲组 (高中)', bibColor: 'white', bibLabel: '白布' },
    '男乙': { code: '2', label: '男乙', division: '初中', fullName: '男子乙组 (初中)', bibColor: 'white', bibLabel: '白布' },
    '女甲': { code: '4', label: '女甲', division: '高中', fullName: '女子甲组 (高中)', bibColor: 'white', bibLabel: '白布' },
    '女乙': { code: '5', label: '女乙', division: '初中', fullName: '女子乙组 (初中)', bibColor: 'white', bibLabel: '白布' },
    '公开': { code: '0', label: '公开', division: '全校公开', fullName: '全校公开组 (4男4女)', bibColor: 'white', bibLabel: '白布' }
  };

  function getDivisionLabel(group) {
    if (group === '公开') return '全校公开';
    return (GROUPS[group] && GROUPS[group].division) || ((group === '男甲' || group === '女甲') ? '高中' : '初中');
  }

  var GROUP_ORDER = ['男甲', '女甲', '男乙', '女乙'];

  // 章程第 10.2 条：积分分配表
  var POINTS_INDIVIDUAL = [7, 5, 3, 2, 1];
  var POINTS_TEAM = [10, 7, 5, 3, 1];

  // 章程第 10.1.3 条：决赛道次分配顺序
  var LANES_4 = [3, 2, 1, 4];
  var LANES_60M = [4, 3, 2, 5, 1, 6];

  var TV_MODES = {
    standings: { id: 'standings', label: '四队总积分榜', icon: '🏆' },
    all_finals: { id: 'all_finals', label: '当天决赛成绩总览', icon: '📋' },
    trophies: { id: 'trophies', label: '奖杯与奖牌颁发细节', icon: '👑' },
    live_results: { id: 'live_results', label: '单项决赛揭晓', icon: '⚡' },
    startlist: { id: 'startlist', label: '决赛出场名单', icon: '🏃' },
    qualifiers: { id: 'qualifiers', label: '预赛晋级与道次', icon: '🎯' },
    podium: { id: 'podium', label: '颁奖典礼领奖台', icon: '🥇' }
  };

  // =========================================================================
  // 1. 章程第 13 & 14 条：4位数运动员编号解析
  // =========================================================================
  function parseBib(bibInput) {
    var raw = String(bibInput || '').trim();
    if (!/^\d{4}$/.test(raw)) {
      return { valid: false, bib: raw, team: null, group: null, bibColor: 'white', seq: '' };
    }
    var teamDigit = raw.charAt(0);
    var groupDigit = raw.charAt(1);
    var seq = raw.slice(2);

    var teamMap = { '1': 'red', '2': 'yellow', '3': 'blue', '4': 'green' };
    var groupMap = { '0': '公开', '1': '男甲', '2': '男乙', '4': '女甲', '5': '女乙' };

    var team = teamMap[teamDigit] || null;
    var group = groupMap[groupDigit] || null;
    var bibColor = group ? GROUPS[group].bibColor : 'white';

    return {
      valid: !!(team && group),
      bib: raw,
      team: team,
      group: group,
      bibColor: bibColor,
      seq: seq
    };
  }

  function getGroupBibColor() {
    return 'white';
  }

  function normalizeTeamId(val) {
    var s = String(val || '').trim().toLowerCase();
    if (s === 'red' || s.indexOf('红') !== -1 || s === '1') return 'red';
    if (s === 'yellow' || s.indexOf('黄') !== -1 || s === '2') return 'yellow';
    if (s === 'blue' || s.indexOf('蓝') !== -1 || s === '3') return 'blue';
    if (s === 'green' || s.indexOf('青') !== -1 || s.indexOf('绿') !== -1 || s === '4') return 'green';
    return 'red';
  }

  // =========================================================================
  // 2. 成绩解析与格式化（支持径赛 mm:ss.ms 与田赛三次试跳）
  // =========================================================================
  function parseTrackTimeToSeconds(val) {
    if (val === null || val === undefined) return null;
    var s = String(val).trim();
    if (!s || /^(DNS|DNF|DQ|NM|WD|X|-|—)$/i.test(s)) return null;
    // 兼容 Excel 全角引号写法（如 9‘03.39“、10’42.97"、12.86"、50.29'）
    s = s.replace(/[“”"″′'’\s]+$/g, '').replace(/s$/i, '').trim();
    var cleaned = s.replace(/[′'‘’]/g, ':').replace(/[″“”"]/g, '.').trim();
    if (cleaned.indexOf(':') !== -1) {
      var parts = cleaned.split(':');
      if (parts.length === 2) {
        var mins = parseFloat(parts[0]);
        var secs = parseFloat(parts[1]);
        if (!isNaN(mins) && !isNaN(secs)) return mins * 60 + secs;
      }
      if (parts.length === 3) {
        var hrs = parseFloat(parts[0]);
        var m2 = parseFloat(parts[1]);
        var s2 = parseFloat(parts[2]);
        if (!isNaN(hrs) && !isNaN(m2) && !isNaN(s2)) return hrs * 3600 + m2 * 60 + s2;
      }
    }
    var num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  function parseFieldMark(val) {
    if (val === null || val === undefined) return null;
    var s = String(val).trim();
    if (!s || /^(DNS|DNF|DQ|NM|WD|X|-|—|FOUL)$/i.test(s)) return null;
    if (/cm$/i.test(s)) {
      var cm = parseFloat(s.replace(/cm$/i, '').trim());
      return isNaN(cm) ? null : (cm / 100);
    }
    var num = parseFloat(s.replace(/m$/i, '').trim());
    return isNaN(num) ? null : num;
  }

  function formatTrackSeconds(sec) {
    if (sec === null || sec === undefined || isNaN(sec)) return '-';
    if (sec >= 60) {
      var mins = Math.floor(sec / 60);
      var rem = (sec - mins * 60).toFixed(2);
      if (parseFloat(rem) < 10) rem = '0' + rem;
      return mins + ':' + rem;
    }
    return sec.toFixed(2);
  }

  function formatMarkDisplay(entry, event) {
    if (!entry) return '-';
    var st = String(entry.status || 'OK').toUpperCase();
    if (st !== 'OK' && st !== '') return st;

    if (event.type === 'field') {
      var best = getFieldSortedMarks(entry)[0];
      if (best === undefined || best === null) {
        var fallback = parseFieldMark(entry.result);
        return fallback !== null ? fallback.toFixed(2) + 'm' : '-';
      }
      return best.toFixed(2) + 'm';
    }
    if (event.type === 'tug') {
      var rStr = String(entry.result || '').trim();
      if (!rStr) return '-';
      return /^\d+$/.test(rStr) ? ('第 ' + rStr + ' 名') : rStr;
    }
    var sec = parseTrackTimeToSeconds(entry.result);
    if (sec === null) return entry.result ? String(entry.result) : '-';
    return formatTrackSeconds(sec) + (event.type === 'track' ? 's' : '');
  }

  function getFieldSortedMarks(entry) {
    var raw = [entry.attempt1, entry.attempt2, entry.attempt3, entry.attempt4, entry.attempt5, entry.attempt6];
    var nums = [];
    for (var i = 0; i < raw.length; i++) {
      var n = parseFieldMark(raw[i]);
      if (n !== null) nums.push(n);
    }
    if (nums.length === 0 && entry.result !== undefined && entry.result !== '') {
      var single = parseFieldMark(entry.result);
      if (single !== null) nums.push(single);
    }
    nums.sort(function (a, b) { return b - a; });
    return nums;
  }

  function parseNumericRecord(event) {
    if (!event || !event.recordMark) return null;
    return event.type === 'field'
      ? parseFieldMark(event.recordMark)
      : parseTrackTimeToSeconds(event.recordMark);
  }

  // =========================================================================
  // 3. 成绩排名、并列平分（章程10.3-10.4）与破纪录计算
  // =========================================================================
  function calculateEntries(entries, event, isFinalStage) {
    var cloned = (entries || []).map(function (item, idx) {
      return Object.assign({ _origIdx: idx }, item);
    });

    var recordVal = parseNumericRecord(event);
    var isWindAssisted = false;

    var validList = [];
    var invalidList = [];

    cloned.forEach(function (entry) {
      var st = String(entry.status || 'OK').toUpperCase();
      entry.status = st || 'OK';
      entry.windAssisted = false;
      entry.isRecord = false;
      entry.rank = null;
      entry.points = 0;

      if (entry.status !== 'OK') {
        invalidList.push(entry);
        return;
      }

      if (event.type === 'field') {
        var marks = getFieldSortedMarks(entry);
        if (marks.length === 0) {
          invalidList.push(entry);
          return;
        }
        entry._sortMarks = marks;
        entry._primaryVal = marks[0];
        entry.result = marks[0].toFixed(2);
        validList.push(entry);
      } else if (event.type === 'tug') {
        // 拔河赛可直接录入名次或胜场次数值（若输入 1/2/3/4 或胜场）
        var tugVal = parseFloat(entry.result);
        if (isNaN(tugVal)) {
          invalidList.push(entry);
          return;
        }
        entry._primaryVal = tugVal;
        validList.push(entry);
      } else {
        var sec = parseTrackTimeToSeconds(entry.result);
        if (sec === null) {
          invalidList.push(entry);
          return;
        }
        entry._primaryVal = sec;
        validList.push(entry);
      }
    });

    // 排序规则
    validList.sort(function (a, b) {
      if (event.type === 'field') {
        var len = Math.max(a._sortMarks.length, b._sortMarks.length);
        for (var i = 0; i < len; i++) {
          var va = a._sortMarks[i] !== undefined ? a._sortMarks[i] : -1;
          var vb = b._sortMarks[i] !== undefined ? b._sortMarks[i] : -1;
          if (Math.abs(vb - va) > 1e-6) return vb - va;
        }
        if (typeof a.tieBreakVal === 'number' && typeof b.tieBreakVal === 'number' && a.tieBreakVal !== b.tieBreakVal) {
          return a.tieBreakVal - b.tieBreakVal;
        }
        return (a.lane || 0) - (b.lane || 0);
      }
      // 径赛 & 拔河默认小值优（拔河若直接填名次 1,2,3,4 则第1名最小）
      if (Math.abs(a._primaryVal - b._primaryVal) > 1e-6) {
        return a._primaryVal - b._primaryVal;
      }
      return (a.lane || 0) - (b.lane || 0);
    });

    function isSamePerformance(a, b) {
      if (event.type === 'field') {
        if (a._sortMarks.length !== b._sortMarks.length) return false;
        for (var i = 0; i < a._sortMarks.length; i++) {
          if (Math.abs(a._sortMarks[i] - b._sortMarks[i]) > 1e-6) return false;
        }
        if (typeof a.tieBreakVal === 'number' && typeof b.tieBreakVal === 'number' && a.tieBreakVal !== b.tieBreakVal) {
          return false;
        }
        return true;
      }
      return Math.abs(a._primaryVal - b._primaryVal) <= 1e-6;
    }

    var pointsScale = event.isTeam ? POINTS_TEAM : POINTS_INDIVIDUAL;
    var bestRecordCandidateVal = null;

    var i = 0;
    while (i < validList.length) {
      var j = i + 1;
      while (j < validList.length && isSamePerformance(validList[i], validList[j])) {
        j++;
      }
      var rank = i + 1;
      var tieCount = j - i;

      // 章程第 10.3 & 10.4 条：并列平分所占名次的分数总和
      var totalGroupPts = 0;
      if (isFinalStage) {
        for (var p = i; p < j; p++) {
          totalGroupPts += (pointsScale[p] || 0);
        }
      }
      var avgPts = isFinalStage ? Math.round((totalGroupPts / tieCount) * 100) / 100 : 0;

      for (var k = i; k < j; k++) {
        var item = validList[k];
        item.rank = rank;
        item.points = avgPts;
        item.isTied = tieCount > 1;
        item.windAssisted = isWindAssisted;

        if (recordVal !== null && !isWindAssisted && event.type !== 'tug') {
          var broke = event.type === 'field'
            ? item._primaryVal > recordVal + 1e-6
            : item._primaryVal < recordVal - 1e-6;
          if (broke) {
            if (bestRecordCandidateVal === null || Math.abs(item._primaryVal - bestRecordCandidateVal) <= 1e-6) {
              bestRecordCandidateVal = item._primaryVal;
              item.isRecord = true;
            }
          }
        }
      }
      i = j;
    }

    return validList.concat(invalidList);
  }

  // =========================================================================
  // 4. 章程第 10.1.2 & 10.1.3 条：预赛晋级（Q/q）与决赛道次自动编排
  // =========================================================================
  function computePrelimQualifiers(event) {
    var prelims = (event.prelimEntries || []).map(function (e) { return Object.assign({}, e); });
    if (prelims.length === 0) return { entries: [], qualifiers: [] };

    var is60m = !!(event.is60m || String(event.name).indexOf('60') !== -1);
    var maxSlots = is60m ? 6 : 4;
    var laneAssignment = is60m ? LANES_60M : LANES_4;

    // 按分组计算组内名次
    var heatMap = {};
    prelims.forEach(function (e) {
      var h = String(e.heat || '1');
      if (!heatMap[h]) heatMap[h] = [];
      heatMap[h].push(e);
    });

    var autoQ = [];
    var nonQ = [];

    Object.keys(heatMap).sort().forEach(function (h) {
      var rankedHeat = calculateEntries(heatMap[h], event, false);
      rankedHeat.forEach(function (item) {
        item.heatRank = item.rank;
        item.qualBadge = '';
        if (item.rank === 1 && item.status === 'OK') {
          item.qualBadge = 'Q';
          autoQ.push(item);
        } else if (item.rank !== null && item.status === 'OK') {
          nonQ.push(item);
        }
      });
      heatMap[h] = rankedHeat;
    });

    var heatCount = Object.keys(heatMap).length;
    var remainingSlots = Math.max(0, maxSlots - autoQ.length);

    // 若只有1个预赛分组，则取前 maxSlots 名为 Q
    if (heatCount === 1) {
      autoQ = [];
      nonQ = [];
      var singleList = heatMap[Object.keys(heatMap)[0]] || [];
      singleList.forEach(function (item, idx) {
        if (item.status === 'OK' && idx < maxSlots) {
          item.qualBadge = 'Q';
          autoQ.push(item);
        } else {
          item.qualBadge = '';
          nonQ.push(item);
        }
      });
    } else {
      // 章程 10.1.2：其余择优录取，若时间相同则比较名次
      nonQ.sort(function (a, b) {
        if (Math.abs(a._primaryVal - b._primaryVal) > 1e-6) {
          return event.type === 'field' ? (b._primaryVal - a._primaryVal) : (a._primaryVal - b._primaryVal);
        }
        return (a.heatRank || 99) - (b.heatRank || 99);
      });
      for (var i = 0; i < Math.min(remainingSlots, nonQ.length); i++) {
        nonQ[i].qualBadge = 'q';
        autoQ.push(nonQ[i]);
      }
    }

    // 所有晋级选手按预赛成绩总排序，分配决赛道次（第 3,2,1,4 道 或 4,3,2,5,1,6 道）
    autoQ.sort(function (a, b) {
      if (Math.abs(a._primaryVal - b._primaryVal) > 1e-6) {
        return event.type === 'field' ? (b._primaryVal - a._primaryVal) : (a._primaryVal - b._primaryVal);
      }
      return (a.heatRank || 99) - (b.heatRank || 99);
    });

    var qualifiers = autoQ.slice(0, maxSlots).map(function (qItem, idx) {
      var assignedLane = laneAssignment[idx] !== undefined ? laneAssignment[idx] : (idx + 1);
      qItem.assignedFinalLane = assignedLane;
      return {
        bib: qItem.bib,
        name: qItem.name,
        className: qItem.className,
        team: qItem.team,
        group: qItem.group || event.group,
        lane: assignedLane,
        prelimMark: formatMarkDisplay(qItem, event),
        qualBadge: qItem.qualBadge,
        result: '',
        attempt1: '',
        attempt2: '',
        attempt3: '',
        status: 'OK'
      };
    });

    var combined = [];
    Object.keys(heatMap).sort().forEach(function (h) {
      combined = combined.concat(heatMap[h]);
    });

    // 按照最终道次排序方便展示
    qualifiers.sort(function (a, b) { return a.lane - b.lane; });

    return { entries: combined, qualifiers: qualifiers, laneRule: is60m ? '60米 6道 (4-3-2-5-1-6)' : '常规 4道 (3-2-1-4)' };
  }

  // =========================================================================
  // 5. 章程第 15.1 条：缺席（DNS）跨项目自动失格预警
  // =========================================================================
  function getDnsDisqualifications(state) {
    var firstDnsByBib = {};
    var warnings = {}; // key: eventId + '|' + bib -> message

    (state.events || []).forEach(function (ev, evIdx) {
      var checkList = (ev.prelimEntries || []).concat(ev.finalEntries || []);
      checkList.forEach(function (entry) {
        var bib = String(entry.bib || '').trim();
        if (!/^\d{4}$/.test(bib)) return;

        if (firstDnsByBib[bib] && firstDnsByBib[bib].eventIdx < evIdx) {
          warnings[ev.id + '|' + bib] = '依章程 15.1：该生于「' + firstDnsByBib[bib].eventName + '」缺席 (DNS)，自动取消后续资格';
        }
        if (String(entry.status || '').toUpperCase() === 'DNS' && !firstDnsByBib[bib]) {
          firstDnsByBib[bib] = { eventIdx: evIdx, eventName: ev.group + ' ' + ev.name };
        }
      });
    });

    return { firstDnsByBib: firstDnsByBib, warnings: warnings };
  }

  // =========================================================================
  // 6. 汇总四色总积分、项目奖牌、实体奖牌核算与最佳运动员（章程 9 & 10）
  // =========================================================================
  function computeStandings(state) {
    var teams = {};
    TEAM_ORDER.forEach(function (tid) {
      teams[tid] = {
        id: tid,
        name: TEAMS[tid].name,
        enName: TEAMS[tid].enName,
        color: TEAMS[tid].color,
        points: 0,
        gold: 0,
        silver: 0,
        bronze: 0,
        physicalMedals: 0,
        spiritScore: Number((state.spiritScores && state.spiritScores[tid]) || 0)
      };
    });

    var athleteGoldMap = {}; // key: bib -> { bib, name, className, team, group, golds, events }
    var recordsList = [];
    var physicalBreakdown = [];

    (state.events || []).forEach(function (ev) {
      if (!ev.finalEntries || ev.finalEntries.length === 0) return;
      var computed = calculateEntries(ev.finalEntries, ev, true);
      var hasAnyScored = computed.some(function (c) { return c.rank !== null; });
      if (!hasAnyScored && ev.status !== 'finished') return;

      // 实体奖牌倍数（章程 9.1 - 9.4）
      var medalMultiplier = ev.physicalMedalCount ? Number(ev.physicalMedalCount) : (
        ev.teamMedalRule === 'tug_or_grand' ? 8 :
          ev.teamMedalRule === 'relay' ? 5 : 1
      );

      var eventMedals = { eventName: (ev.group ? ev.group + ' ' : '') + ev.name, multiplier: medalMultiplier, red: 0, yellow: 0, blue: 0, green: 0 };

      computed.forEach(function (entry) {
        var tid = normalizeTeamId(entry.team || (parseBib(entry.bib).team));
        if (teams[tid]) {
          teams[tid].points = Math.round((teams[tid].points + (entry.points || 0)) * 100) / 100;

          if (entry.rank === 1) {
            teams[tid].gold += 1;
            teams[tid].physicalMedals += medalMultiplier;
            eventMedals[tid] += medalMultiplier;
          } else if (entry.rank === 2) {
            teams[tid].silver += 1;
            teams[tid].physicalMedals += medalMultiplier;
            eventMedals[tid] += medalMultiplier;
          } else if (entry.rank === 3) {
            teams[tid].bronze += 1;
            teams[tid].physicalMedals += medalMultiplier;
            eventMedals[tid] += medalMultiplier;
          }
        }

        // 章程第 10.5 条：最佳运动员（仅计个人项目金牌）
        if (!ev.isTeam && entry.rank === 1) {
          var key = (entry.bib || entry.name) + '_' + (entry.group || ev.group);
          if (!athleteGoldMap[key]) {
            athleteGoldMap[key] = {
              bib: entry.bib,
              name: entry.name,
              className: entry.className || '',
              team: tid,
              group: entry.group || ev.group,
              golds: 0,
              events: []
            };
          }
          athleteGoldMap[key].golds += 1;
          athleteGoldMap[key].events.push(ev.name);
        }

        // 破大会纪录统计
        if (entry.isRecord) {
          recordsList.push({
            eventId: ev.id,
            eventName: (ev.group ? ev.group + ' ' : '') + ev.name,
            bib: entry.bib,
            name: entry.name,
            className: entry.className,
            team: tid,
            newMark: formatMarkDisplay(entry, ev),
            oldMark: ev.recordMark || '-'
          });
        }
      });

      if (hasAnyScored) physicalBreakdown.push(eventMedals);
    });

    var rankedTeams = TEAM_ORDER.map(function (tid) { return teams[tid]; }).sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      return b.bronze - a.bronze;
    });

    var maxPoints = rankedTeams[0] ? Math.max(rankedTeams[0].points, 1) : 1;
    rankedTeams.forEach(function (t, idx) {
      t.rank = idx + 1;
      t.progressPct = Math.round((t.points / maxPoints) * 100);
    });

    // 各组最佳运动员（若同则共享）
    var bestAthletes = {};
    GROUP_ORDER.forEach(function (grp) {
      var list = Object.keys(athleteGoldMap)
        .map(function (k) { return athleteGoldMap[k]; })
        .filter(function (a) { return a.group === grp; })
        .sort(function (a, b) { return b.golds - a.golds; });
      if (list.length === 0) {
        bestAthletes[grp] = { group: grp, leaders: [], maxGolds: 0, shared: false };
      } else {
        var maxG = list[0].golds;
        var winners = list.filter(function (x) { return x.golds === maxG; });
        bestAthletes[grp] = { group: grp, leaders: winners, maxGolds: maxG, shared: winners.length > 1 };
      }
    });

    // 最佳精神奖领先者
    var spiritSorted = TEAM_ORDER.map(function (tid) {
      return { id: tid, name: TEAMS[tid].name, color: TEAMS[tid].color, score: teams[tid].spiritScore };
    }).sort(function (a, b) { return b.score - a.score; });

    return {
      teamsMap: teams,
      rankedTeams: rankedTeams,
      bestAthletes: bestAthletes,
      recordsList: recordsList,
      physicalBreakdown: physicalBreakdown,
      spiritSorted: spiritSorted
    };
  }

  // =========================================================================
  // 7. 预置丰富的新民独立中学 2026 运动会演示数据集
  // =========================================================================
  function createDefaultState() {
    return {
      "meta": {
        "title": "亚罗士打新民独立中学 2026 年度运动会",
        "subtitle": "SIN MIN MIDDLE SCHOOL ANNUAL SPORTS MEET 2026",
        "schoolName": "亚罗士打新民独立中学",
        "meetTitle": "2026年校内运动会",
        "meetDate": "2026-12-02",
        "updatedAt": "2026-11-18T06:50:00.000Z",
        "githubRepo": "felixyu9722/sinmin-sports-2026",
        "googleSheetCsvUrl": "",
        "googleAppsScriptUrl": "",
        "tickerOverride": ""
      },
      "spiritScores": {
        "red": 0,
        "yellow": 0,
        "blue": 0,
        "green": 0
      },
      "events": [
        {
          "id": "ev_sp_jb",
          "order": 1,
          "name": "铅球 (4kg)",
          "group": "男乙",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "15/11 · 场次1",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "3203",
              "name": "林楷志",
              "className": "初三忠",
              "team": "blue",
              "attempt1": "5.37",
              "attempt2": "5.69",
              "attempt3": "5.83",
              "attempt4": "5.82",
              "attempt5": "5.61",
              "attempt6": "5.73",
              "result": "5.83",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2208",
              "name": "冯佳伟",
              "className": "初二忠",
              "team": "yellow",
              "attempt1": "2.67",
              "attempt2": "2.70",
              "attempt3": "2.63",
              "attempt4": "3.67",
              "attempt5": "4.48",
              "attempt6": "3.95",
              "result": "4.48",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "1203",
              "name": "黄宣晸",
              "className": "初二孝",
              "team": "red",
              "attempt1": "4.53",
              "attempt2": "4.75",
              "attempt3": "4.47",
              "attempt4": "4.97",
              "attempt5": "4.65",
              "attempt6": "5.07",
              "result": "5.07",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4208",
              "name": "黄浩宇",
              "className": "初三忠",
              "team": "green",
              "attempt1": "X",
              "attempt2": "X",
              "attempt3": "X",
              "attempt4": "3.22",
              "attempt5": "X",
              "attempt6": "3.10",
              "result": "3.22",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "4207",
              "name": "黄语森",
              "className": "初一孝",
              "team": "green",
              "attempt1": "X",
              "attempt2": "3.34",
              "attempt3": "X",
              "attempt4": "3.34",
              "attempt5": "3.20",
              "attempt6": "3.20",
              "result": "3.34",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "2201",
              "name": "林凯泽",
              "className": "初三忠",
              "team": "yellow",
              "attempt1": "5.83",
              "attempt2": "6.95",
              "attempt3": "7.73",
              "attempt4": "X",
              "attempt5": "7.25",
              "attempt6": "7.73",
              "result": "",
              "status": "DQ",
              "note": "犯规"
            },
            {
              "lane": 7,
              "bib": "3201",
              "name": "林子恒",
              "className": "初二孝",
              "team": "blue",
              "attempt1": "6.10",
              "attempt2": "6.70",
              "attempt3": "6.18",
              "attempt4": "6.42",
              "attempt5": "5.96",
              "attempt6": "6.08",
              "result": "6.70",
              "status": "OK"
            },
            {
              "lane": 8,
              "bib": "1202",
              "name": "林颜竜",
              "className": "初一忠",
              "team": "red",
              "attempt1": "X",
              "attempt2": "5.25",
              "attempt3": "5.60",
              "attempt4": "5.67",
              "attempt5": "5.74",
              "attempt6": "5.96",
              "result": "5.96",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_sp_sb",
          "order": 2,
          "name": "铅球 (5kg)",
          "group": "男甲",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "15/11 · 场次11",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "4108",
              "name": "王奕诚",
              "className": "高二文商",
              "team": "green",
              "attempt1": "X",
              "attempt2": "5.10",
              "attempt3": "X",
              "attempt4": "X",
              "attempt5": "X",
              "attempt6": "4.62",
              "result": "5.10",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "1104",
              "name": "杨絖喆",
              "className": "高三文商",
              "team": "red",
              "attempt1": "7.92",
              "attempt2": "8.60",
              "attempt3": "7.95",
              "attempt4": "7.85",
              "attempt5": "X",
              "attempt6": "8.04",
              "result": "8.60",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3104",
              "name": "马有友",
              "className": "高三文商",
              "team": "blue",
              "attempt1": "6.42",
              "attempt2": "6.60",
              "attempt3": "",
              "attempt4": "X",
              "attempt5": "5.72",
              "attempt6": "5.83",
              "result": "6.60",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "1109",
              "name": "杜泳利",
              "className": "高一文商",
              "team": "red",
              "attempt1": "5.70",
              "attempt2": "6.40",
              "attempt3": "5.43",
              "attempt4": "5.29",
              "attempt5": "6.66",
              "attempt6": "6.05",
              "result": "6.66",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "4106",
              "name": "邱天立",
              "className": "高二餐饮",
              "team": "green",
              "attempt1": "6.27",
              "attempt2": "6.70",
              "attempt3": "6.86",
              "attempt4": "X",
              "attempt5": "6.15",
              "attempt6": "7.00",
              "result": "7.00",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "2108",
              "name": "卢锦原",
              "className": "高三文商",
              "team": "yellow",
              "attempt1": "9.05",
              "attempt2": "8.40",
              "attempt3": "9.25",
              "attempt4": "9.25",
              "attempt5": "X",
              "attempt6": "9.35",
              "result": "9.35",
              "status": "OK"
            },
            {
              "lane": 7,
              "bib": "3101",
              "name": "邹捷贺",
              "className": "高三烘培",
              "team": "blue",
              "attempt1": "7.96",
              "attempt2": "7.30",
              "attempt3": "X",
              "attempt4": "7.80",
              "attempt5": "X",
              "attempt6": "X",
              "result": "7.96",
              "status": "OK"
            },
            {
              "lane": 8,
              "bib": "2107",
              "name": "邱嘉旭",
              "className": "高三烘培",
              "team": "yellow",
              "attempt1": "9.62",
              "attempt2": "9.37",
              "attempt3": "10.05",
              "attempt4": "10.02",
              "attempt5": "9.53",
              "attempt6": "9.32",
              "result": "10.05",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_sp_jg",
          "order": 3,
          "name": "铅球 (3kg)",
          "group": "女乙",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "16/11 · 场次1",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1504",
              "name": "邓卉恩",
              "className": "初三忠",
              "team": "red",
              "attempt1": "3.75",
              "attempt2": "0.94",
              "attempt3": "4.22",
              "attempt4": "3.85",
              "attempt5": "4.34",
              "attempt6": "3.85",
              "result": "4.34",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "4508",
              "name": "林巧萱",
              "className": "初三忠",
              "team": "green",
              "attempt1": "3.99",
              "attempt2": "4.40",
              "attempt3": "4.54",
              "attempt4": "4.43",
              "attempt5": "4.85",
              "attempt6": "5.03",
              "result": "5.03",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "1507",
              "name": "林杏恩",
              "className": "初二忠",
              "team": "red",
              "attempt1": "3.50",
              "attempt2": "4.76",
              "attempt3": "5.10",
              "attempt4": "5.30",
              "attempt5": "5.23",
              "attempt6": "X",
              "result": "5.30",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4501",
              "name": "曾钰昕",
              "className": "初一忠",
              "team": "green",
              "attempt1": "2.40",
              "attempt2": "3.90",
              "attempt3": "3.71",
              "attempt4": "3.68",
              "attempt5": "3.66",
              "attempt6": "3.45",
              "result": "3.90",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "3504",
              "name": "陈宣彤",
              "className": "初三孝",
              "team": "blue",
              "attempt1": "3.07",
              "attempt2": "4.33",
              "attempt3": "4.14",
              "attempt4": "4.30",
              "attempt5": "4.65",
              "attempt6": "4.54",
              "result": "4.65",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "3510",
              "name": "曾紫琳",
              "className": "初一忠",
              "team": "blue",
              "attempt1": "X",
              "attempt2": "2.95",
              "attempt3": "2.74",
              "attempt4": "X",
              "attempt5": "X",
              "attempt6": "3.30",
              "result": "3.30",
              "status": "OK"
            },
            {
              "lane": 7,
              "bib": "2502",
              "name": "方翎恩",
              "className": "初二孝",
              "team": "yellow",
              "attempt1": "X",
              "attempt2": "X",
              "attempt3": "3.37",
              "attempt4": "3.15",
              "attempt5": "3.78",
              "attempt6": "X",
              "result": "3.78",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_sp_sg",
          "order": 4,
          "name": "铅球 (3kg)",
          "group": "女甲",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "16/11 · 场次10",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1402",
              "name": "黄嘉欣",
              "className": "高二文商",
              "team": "red",
              "attempt1": "5.38",
              "attempt2": "5.45",
              "attempt3": "5.66",
              "attempt4": "5.45",
              "attempt5": "5.40",
              "attempt6": "5.95",
              "result": "5.95",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "1404",
              "name": "马峄琪",
              "className": "高一文商",
              "team": "red",
              "attempt1": "4.00",
              "attempt2": "4.38",
              "attempt3": "4.72",
              "attempt4": "5.47",
              "attempt5": "5.18",
              "attempt6": "5.32",
              "result": "5.47",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3405",
              "name": "张瑜轩",
              "className": "高一文商",
              "team": "blue",
              "attempt1": "2.22",
              "attempt2": "3.17",
              "attempt3": "4.08",
              "attempt4": "4.50",
              "attempt5": "X",
              "attempt6": "4.67",
              "result": "4.67",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4407",
              "name": "李爱琪",
              "className": "高一餐饮",
              "team": "green",
              "attempt1": "1.99",
              "attempt2": "2.69",
              "attempt3": "2.85",
              "attempt4": "3.30",
              "attempt5": "3.21",
              "attempt6": "3.39",
              "result": "3.39",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "2404",
              "name": "黄静诗",
              "className": "高三文商",
              "team": "yellow",
              "attempt1": "4.25",
              "attempt2": "X",
              "attempt3": "4.47",
              "attempt4": "4.83",
              "attempt5": "4.67",
              "attempt6": "4.83",
              "result": "4.83",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "3403",
              "name": "杜紫微",
              "className": "高一文商",
              "team": "blue",
              "attempt1": "2.97",
              "attempt2": "3.35",
              "attempt3": "3.12",
              "attempt4": "2.72",
              "attempt5": "3.57",
              "attempt6": "3.28",
              "result": "3.57",
              "status": "OK"
            },
            {
              "lane": 7,
              "bib": "2402",
              "name": "张紫微",
              "className": "高二文商",
              "team": "yellow",
              "attempt1": "X",
              "attempt2": "5.16",
              "attempt3": "5.05",
              "attempt4": "4.58",
              "attempt5": "5.03",
              "attempt6": "5.48",
              "result": "5.48",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_hj_jg",
          "order": 5,
          "name": "跳高",
          "group": "女乙",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "15/11 · 场次2",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "3505",
              "name": "蔡碧恬",
              "className": "初二忠",
              "team": "blue",
              "result": "1.18",
              "attempt1": "1.18",
              "tieBreakVal": 3,
              "note": "118(O) 120(XXX)",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2505",
              "name": "黄裔童",
              "className": "初三忠",
              "team": "yellow",
              "result": "1.00",
              "attempt1": "1.00",
              "tieBreakVal": 101,
              "note": "100(XO) 105(XXX)",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3507",
              "name": "林心茹",
              "className": "初一忠",
              "team": "blue",
              "result": "1.00",
              "attempt1": "1.00",
              "tieBreakVal": 101,
              "note": "100(XO) 105(XXX)",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "1502",
              "name": "马萱",
              "className": "初一孝",
              "team": "red",
              "result": "1.08",
              "attempt1": "1.08",
              "tieBreakVal": 0,
              "note": "108(O) 110(XXX)",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "2506",
              "name": "胡巧萱",
              "className": "初二忠",
              "team": "yellow",
              "result": "1.00",
              "attempt1": "1.00",
              "tieBreakVal": 0,
              "note": "100(O) 105(X--)",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "4506",
              "name": "林芷宇",
              "className": "初三孝",
              "team": "green",
              "result": "",
              "note": "100(XXX)",
              "status": "NM"
            },
            {
              "lane": 7,
              "bib": "4505",
              "name": "林恩佩",
              "className": "初二忠",
              "team": "green",
              "result": "1.00",
              "attempt1": "1.00",
              "tieBreakVal": 202,
              "note": "100(XXO) 105(XXX)",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_hj_sg",
          "order": 6,
          "name": "跳高",
          "group": "女甲",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "15/11 · 场次12",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "3407",
              "name": "李嘉萱",
              "className": "高一文商",
              "team": "blue",
              "result": "",
              "note": "105(XXX)",
              "status": "NM"
            },
            {
              "lane": 2,
              "bib": "3404",
              "name": "蔡碧萱",
              "className": "高一文商",
              "team": "blue",
              "result": "",
              "note": "105(XXX)",
              "status": "NM"
            },
            {
              "lane": 3,
              "bib": "1401",
              "name": "陈慧文",
              "className": "高一文商",
              "team": "red",
              "result": "1.11",
              "attempt1": "1.11",
              "tieBreakVal": 203,
              "note": "111(XXO) 113(XXX)",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "2401",
              "name": "邱天心",
              "className": "高二餐饮",
              "team": "yellow",
              "result": "1.05",
              "attempt1": "1.05",
              "tieBreakVal": 0,
              "note": "105(O) 108(XXX)",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "4401",
              "name": "胡巧微",
              "className": "高三烘培",
              "team": "green",
              "result": "",
              "note": "105(-)",
              "status": "NM"
            },
            {
              "lane": 6,
              "bib": "4404",
              "name": "曾薇颖",
              "className": "高二餐饮",
              "team": "green",
              "result": "",
              "note": "未出赛",
              "status": "NM"
            }
          ]
        },
        {
          "id": "ev_1500m_jg",
          "order": 7,
          "name": "1500米",
          "group": "女乙",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "16/11 · 场次11",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "2504",
              "name": "林思涵",
              "className": "初一忠",
              "team": "yellow",
              "result": "10:42.97",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2503",
              "name": "曾炜焮",
              "className": "初二孝",
              "team": "yellow",
              "result": "10:10.96",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "4505",
              "name": "林恩佩",
              "className": "初二忠",
              "team": "green",
              "result": "11:12.45",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "1506",
              "name": "李欣芮",
              "className": "初一忠",
              "team": "red",
              "result": "9:03.39",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_1500m_sg",
          "order": 8,
          "name": "1500米",
          "group": "女甲",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "16/11 · 场次12",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1404",
              "name": "马峄琪",
              "className": "高一文商",
              "team": "red",
              "result": "8:55.86",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "1401",
              "name": "陈慧文",
              "className": "高一文商",
              "team": "red",
              "result": "9:32.96",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "4406",
              "name": "吴家润",
              "className": "高一文商",
              "team": "green",
              "result": "8:47.77",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "2403",
              "name": "傅卉杉",
              "className": "高三文商",
              "team": "yellow",
              "result": "12:16.49",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "4405",
              "name": "蔡子仪",
              "className": "高一文商",
              "team": "green",
              "result": "9:34.04",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "2402",
              "name": "张紫微",
              "className": "高二文商",
              "team": "yellow",
              "result": "11:52.61",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_1500m_jb",
          "order": 9,
          "name": "1500米",
          "group": "男乙",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "16/11 · 场次13",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "2202",
              "name": "王凯翔",
              "className": "初一忠",
              "team": "yellow",
              "result": "7:12.11",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "4205",
              "name": "达南吉",
              "className": "初三孝",
              "team": "green",
              "result": "6:06.65",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "1207",
              "name": "方梓恒",
              "className": "初一忠",
              "team": "red",
              "result": "8:23.13",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "2203",
              "name": "杨忠万",
              "className": "初三忠",
              "team": "yellow",
              "result": "7:22.01",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "4206",
              "name": "全德泉",
              "className": "初二忠",
              "team": "green",
              "result": "7:57.42",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "3201",
              "name": "林子恒",
              "className": "初二孝",
              "team": "blue",
              "result": "",
              "status": "DQ",
              "note": "犯规 (6:35.33)"
            }
          ]
        },
        {
          "id": "ev_1500m_sb",
          "order": 10,
          "name": "1500米",
          "group": "男甲",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "16/11 · 场次14",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "2105",
              "name": "林港卫",
              "className": "高一文商",
              "team": "yellow",
              "result": "6:38.70",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "3109",
              "name": "林师宏",
              "className": "高一文商",
              "team": "blue",
              "result": "6:18.59",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "1108",
              "name": "郭佳义",
              "className": "高二餐饮",
              "team": "red",
              "result": "7:51.58",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4105",
              "name": "朱俊亿",
              "className": "高三文商",
              "team": "green",
              "result": "5:20.63",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "1110",
              "name": "李文保",
              "className": "高一餐饮",
              "team": "red",
              "result": "6:41.54",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_400m_jg",
          "order": 11,
          "name": "400米",
          "group": "女乙",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "18/11 · 场次2",
          "status": "finished",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "4505",
              "name": "林恩佩",
              "className": "初二忠",
              "team": "green",
              "result": "1:58.89",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "3508",
              "name": "李芮禛",
              "className": "初二孝",
              "team": "blue",
              "result": "1:56.49",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "1502",
              "name": "马萱",
              "className": "初一孝",
              "team": "red",
              "result": "1:43.20",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 4,
              "bib": "2503",
              "name": "曾炜焮",
              "className": "初二孝",
              "team": "yellow",
              "result": "1:47.24",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "1503",
              "name": "陈媃茵",
              "className": "初三忠",
              "team": "red",
              "result": "1:57.81",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "2502",
              "name": "方翎恩",
              "className": "初二孝",
              "team": "yellow",
              "result": "2:31.25",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 3,
              "bib": "3501",
              "name": "王愉珺",
              "className": "初二孝",
              "team": "blue",
              "result": "1:45.00",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "2503",
              "name": "曾炜焮",
              "className": "初二孝",
              "team": "yellow",
              "result": "1:53.84",
              "status": "OK",
              "prelimMark": "1:47.24s"
            },
            {
              "lane": 2,
              "bib": "3501",
              "name": "王愉珺",
              "className": "初二孝",
              "team": "blue",
              "result": "1:46.11",
              "status": "OK",
              "prelimMark": "1:45.00s"
            },
            {
              "lane": 3,
              "bib": "1502",
              "name": "马萱",
              "className": "初一孝",
              "team": "red",
              "result": "1:41.35",
              "status": "OK",
              "prelimMark": "1:43.20s"
            },
            {
              "lane": 4,
              "bib": "3508",
              "name": "李芮禛",
              "className": "初二孝",
              "team": "blue",
              "result": "2:09.95",
              "status": "OK",
              "prelimMark": "1:56.49s"
            }
          ]
        },
        {
          "id": "ev_400m_sg",
          "order": 12,
          "name": "400米",
          "group": "女甲",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "18/11 · 场次3",
          "status": "finished",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "4404",
              "name": "曾薇颖",
              "className": "高二餐饮",
              "team": "green",
              "result": "",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "1406",
              "name": "雪晶",
              "className": "高三烘培",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "4403",
              "name": "洪丽凤",
              "className": "高一文商",
              "team": "green",
              "result": "",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "2405",
              "name": "陈靖涵",
              "className": "高一文商",
              "team": "yellow",
              "result": "",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1406",
              "name": "雪晶",
              "className": "高三烘培",
              "team": "red",
              "result": "2:19.79",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "4404",
              "name": "曾薇颖",
              "className": "高二餐饮",
              "team": "green",
              "result": "2:12.19",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "2405",
              "name": "陈靖涵",
              "className": "高一文商",
              "team": "yellow",
              "result": "1:59.56",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4403",
              "name": "洪丽凤",
              "className": "高一文商",
              "team": "green",
              "result": "1:49.03",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_400m_jb",
          "order": 13,
          "name": "400米",
          "group": "男乙",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "18/11 · 场次4",
          "status": "finished",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "3205",
              "name": "许俊超",
              "className": "初一孝",
              "team": "blue",
              "result": "1:28.89",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "4204",
              "name": "陈俊",
              "className": "初一忠",
              "team": "green",
              "result": "1:36.03",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "1205",
              "name": "黄柏杰",
              "className": "初二孝",
              "team": "red",
              "result": "1:23.30",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "4203",
              "name": "陈国俊",
              "className": "初一忠",
              "team": "green",
              "result": "1:16.01",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "2202",
              "name": "王凯翔",
              "className": "初一忠",
              "team": "yellow",
              "result": "1:13.41",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 3,
              "bib": "3201",
              "name": "林子恒",
              "className": "初二孝",
              "team": "blue",
              "result": "1:11.52",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "1206",
              "name": "李陈莱",
              "className": "初三孝",
              "team": "red",
              "result": "1:43.51",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "2202",
              "name": "王凯翔",
              "className": "初一忠",
              "team": "yellow",
              "result": "1:14.72",
              "status": "OK",
              "prelimMark": "1:13.41s"
            },
            {
              "lane": 2,
              "bib": "1205",
              "name": "黄柏杰",
              "className": "初二孝",
              "team": "red",
              "result": "1:18.01",
              "status": "OK",
              "prelimMark": "1:23.30s"
            },
            {
              "lane": 3,
              "bib": "3201",
              "name": "林子恒",
              "className": "初二孝",
              "team": "blue",
              "result": "1:08.01",
              "status": "OK",
              "prelimMark": "1:11.52s"
            },
            {
              "lane": 4,
              "bib": "4203",
              "name": "陈国俊",
              "className": "初一忠",
              "team": "green",
              "result": "1:11.68",
              "status": "OK",
              "prelimMark": "1:16.01s"
            }
          ]
        },
        {
          "id": "ev_400m_sb",
          "order": 14,
          "name": "400米",
          "group": "男甲",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "18/11 · 场次5",
          "status": "finished",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "2103",
              "name": "伍祥豪",
              "className": "高三文商",
              "team": "yellow",
              "result": "1:14.86",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "1101",
              "name": "张玮轩",
              "className": "高三烘培",
              "team": "red",
              "result": "1:16.75",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "3110",
              "name": "沈文轩",
              "className": "高二文商",
              "team": "blue",
              "result": "2:41.08",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 4,
              "bib": "4104",
              "name": "张嘉杰",
              "className": "初三忠",
              "team": "green",
              "result": "1:08.39",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "3105",
              "name": "林韦仁",
              "className": "高二餐饮",
              "team": "blue",
              "result": "1:33.06",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "4101",
              "name": "温宇豪",
              "className": "初一孝",
              "team": "green",
              "result": "1:20.46",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "2101",
              "name": "王翔哲",
              "className": "高二餐饮",
              "team": "yellow",
              "result": "1:10.82",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "2103",
              "name": "伍祥豪",
              "className": "高三文商",
              "team": "yellow",
              "result": "1:13.21",
              "status": "OK",
              "prelimMark": "1:14.86s"
            },
            {
              "lane": 2,
              "bib": "2101",
              "name": "王翔哲",
              "className": "高二餐饮",
              "team": "yellow",
              "result": "1:02.41",
              "status": "OK",
              "prelimMark": "1:10.82s"
            },
            {
              "lane": 3,
              "bib": "4104",
              "name": "张嘉杰",
              "className": "初三忠",
              "team": "green",
              "result": "1:09.60",
              "status": "OK",
              "prelimMark": "1:08.39s"
            },
            {
              "lane": 4,
              "bib": "1101",
              "name": "张玮轩",
              "className": "高三烘培",
              "team": "red",
              "result": "1:16.43",
              "status": "OK",
              "prelimMark": "1:16.75s"
            }
          ]
        },
        {
          "id": "ev_hj_jb",
          "order": 15,
          "name": "跳高",
          "group": "男乙",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "18/11 · 场次1",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1201",
              "name": "叶俊文",
              "className": "初二忠",
              "team": "red",
              "result": "1.35",
              "attempt1": "1.35",
              "tieBreakVal": 0,
              "note": "120(O) 125(O) 130(O) 135(O) 140(XXX)",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "3209",
              "name": "郭凯杰",
              "className": "初二忠",
              "team": "blue",
              "result": "1.30",
              "attempt1": "1.30",
              "tieBreakVal": 2,
              "note": "120(XO) 125(XO) 130(O) 135(XXX)",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "4209",
              "name": "吕浚晖",
              "className": "初二孝",
              "team": "green",
              "result": "1.40",
              "attempt1": "1.40",
              "tieBreakVal": 101,
              "note": "120(O) 125(O) 130(O) 135(O) 140(XO) 145(XXX)",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "3201",
              "name": "林子恒",
              "className": "初二孝",
              "team": "blue",
              "result": "1.20",
              "attempt1": "1.20",
              "tieBreakVal": 205,
              "note": "120(XXO) 125(XXX)",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "2205",
              "name": "陈慨曜",
              "className": "初一忠",
              "team": "yellow",
              "result": "",
              "attempt1": "",
              "note": "120(XXX)",
              "status": "NM"
            },
            {
              "lane": 6,
              "bib": "2203",
              "name": "杨忠万",
              "className": "初三忠",
              "team": "yellow",
              "result": "1.30",
              "attempt1": "1.30",
              "tieBreakVal": 101,
              "note": "120(O) 125(O) 130(XO) 135(XXX)",
              "status": "OK"
            },
            {
              "lane": 7,
              "bib": "4205",
              "name": "达南吉",
              "className": "初三孝",
              "team": "green",
              "result": "1.49",
              "attempt1": "1.49",
              "tieBreakVal": 1,
              "note": "120(O) 125(O) 130(O) 135(O) 140(O) 145(XO) 149(O) 153(XXX)",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_hj_sb",
          "order": 16,
          "name": "跳高",
          "group": "男甲",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "18/11 · 场次7",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "2102",
              "name": "朱宇章",
              "className": "高三烘培",
              "team": "yellow",
              "result": "1.35",
              "attempt1": "1.35",
              "tieBreakVal": 0,
              "note": "130(O) 135(O) 140(XXX)",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2109",
              "name": "王晟祺",
              "className": "高二文商",
              "team": "yellow",
              "result": "1.30",
              "attempt1": "1.30",
              "tieBreakVal": 202,
              "note": "130(XXO) 135(XXX)",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "1107",
              "name": "刘谆宏",
              "className": "高二餐饮",
              "team": "red",
              "result": "",
              "attempt1": "",
              "note": "130(XXX)",
              "status": "NM"
            },
            {
              "lane": 4,
              "bib": "1103",
              "name": "张玮轩",
              "className": "高三烘培",
              "team": "red",
              "result": "",
              "attempt1": "",
              "note": "130(XXX)",
              "status": "NM"
            },
            {
              "lane": 5,
              "bib": "3108",
              "name": "李屹森",
              "className": "高二文商",
              "team": "blue",
              "result": "",
              "attempt1": "",
              "note": "130(XXX)",
              "status": "NM"
            },
            {
              "lane": 6,
              "bib": "3106",
              "name": "林靖翔",
              "className": "高三文商",
              "team": "blue",
              "result": "",
              "attempt1": "",
              "note": "130(XXX)",
              "status": "NM"
            },
            {
              "lane": 7,
              "bib": "4103",
              "name": "林浚韦",
              "className": "高三文商",
              "team": "green",
              "result": "1.40",
              "attempt1": "1.40",
              "tieBreakVal": 105,
              "note": "130(XXO) 135(XXO) 140(XO) 145(XXX)",
              "status": "OK"
            },
            {
              "lane": 8,
              "bib": "4107",
              "name": "卢锦康",
              "className": "高二餐饮",
              "team": "green",
              "result": "1.45",
              "attempt1": "1.45",
              "tieBreakVal": 202,
              "note": "130(O) 135(O) 140(O) 145(XXO) 150(XXX)",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_jt_sg",
          "order": 17,
          "name": "标枪 (500g公开)",
          "group": "女甲",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "18/11 · 场次6",
          "status": "finished",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "4407",
              "name": "李爱琪",
              "className": "高一餐饮",
              "team": "green",
              "result": "5.70",
              "attempt1": "5.07",
              "attempt2": "X",
              "attempt3": "5.65",
              "attempt4": "5.55",
              "attempt5": "X",
              "attempt6": "5.70",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2508",
              "name": "潘安琪",
              "className": "初一孝",
              "team": "yellow",
              "result": "5.02",
              "attempt1": "4.14",
              "attempt2": "3.95",
              "attempt3": "5.02",
              "attempt4": "4.05",
              "attempt5": "4.13",
              "attempt6": "5.02",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3402",
              "name": "陈奕汶",
              "className": "高二餐饮",
              "team": "blue",
              "result": "5.74",
              "attempt1": "5.34",
              "attempt2": "X",
              "attempt3": "5.74",
              "attempt4": "X",
              "attempt5": "X",
              "attempt6": "X",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4508",
              "name": "林巧萱",
              "className": "初三忠",
              "team": "green",
              "result": "7.29",
              "attempt1": "4.093",
              "attempt2": "X",
              "attempt3": "4.93",
              "attempt4": "7.29",
              "attempt5": "7.18",
              "attempt6": "6.36",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "1402",
              "name": "黄嘉欣",
              "className": "高二文商",
              "team": "red",
              "result": "14.17",
              "attempt1": "12.30",
              "attempt2": "14.17",
              "attempt3": "12.16",
              "attempt4": "11.54",
              "attempt5": "11.00",
              "attempt6": "X",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "1404",
              "name": "马峄琪",
              "className": "高一文商",
              "team": "red",
              "result": "14.99",
              "attempt1": "13.50",
              "attempt2": "12.70",
              "attempt3": "14.77",
              "attempt4": "13.56",
              "attempt5": "12.06",
              "attempt6": "14.99",
              "status": "OK"
            },
            {
              "lane": 7,
              "bib": "3406",
              "name": "杜姿颖",
              "className": "高三文商",
              "team": "blue",
              "result": "5.57",
              "attempt1": "5.40",
              "attempt2": "4.70",
              "attempt3": "4.20",
              "attempt4": "4.17",
              "attempt5": "4.17",
              "attempt6": "5.57",
              "status": "OK"
            },
            {
              "lane": 8,
              "bib": "2402",
              "name": "张紫微",
              "className": "高二文商",
              "team": "yellow",
              "result": "12.43",
              "attempt1": "12.43",
              "attempt2": "11.50",
              "attempt3": "11.75",
              "attempt4": "11.24",
              "attempt5": "10.37",
              "attempt6": "10.32",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_200m_jg",
          "order": 18,
          "name": "200米",
          "group": "女乙",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 09:00 · 场次1",
          "status": "prelims_done",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "4504",
              "name": "陈渲潓",
              "className": "初一孝",
              "team": "green",
              "result": "50.29",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "3511",
              "name": "黄颖糅",
              "className": "初二忠",
              "team": "blue",
              "result": "40.74",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "1501",
              "name": "林慧萱",
              "className": "初一忠",
              "team": "red",
              "result": "47.63",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "1503",
              "name": "陈媃茵",
              "className": "初三忠",
              "team": "red",
              "result": "46.79",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "4503",
              "name": "林玉美",
              "className": "初二孝",
              "team": "green",
              "result": "46.03",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 3,
              "bib": "3501",
              "name": "王愉珺",
              "className": "初二孝",
              "team": "blue",
              "result": "43.36",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "2501",
              "name": "杨诗淇",
              "className": "初三忠",
              "team": "yellow",
              "result": "46.71",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "4503",
              "name": "林玉美",
              "className": "初二孝",
              "team": "green",
              "prelimMark": "46.03s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "3501",
              "name": "王愉珺",
              "className": "初二孝",
              "team": "blue",
              "prelimMark": "43.36s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3511",
              "name": "黄颖糅",
              "className": "初二忠",
              "team": "blue",
              "prelimMark": "40.74s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "2501",
              "name": "杨诗淇",
              "className": "初三忠",
              "team": "yellow",
              "prelimMark": "46.71s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_200m_sg",
          "order": 19,
          "name": "200米",
          "group": "女甲",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 09:10 · 场次2",
          "status": "prelims_done",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "4403",
              "name": "洪丽凤",
              "className": "高一文商",
              "team": "green",
              "result": "43.00",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "1402",
              "name": "黄嘉欣",
              "className": "高二文商",
              "team": "red",
              "result": "43.03",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "3401",
              "name": "林可珺",
              "className": "高二餐饮",
              "team": "blue",
              "result": "46.89",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 4,
              "bib": "2401",
              "name": "邱天心",
              "className": "高二餐饮",
              "team": "yellow",
              "result": "39.28",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "1405",
              "name": "王芷乐",
              "className": "高二餐饮",
              "team": "red",
              "result": "45.35",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "4401",
              "name": "胡巧微",
              "className": "高三烘培",
              "team": "green",
              "result": "53.52",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "2406",
              "name": "罗琳琳",
              "className": "初三孝",
              "team": "yellow",
              "result": "39.92",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "4403",
              "name": "洪丽凤",
              "className": "高一文商",
              "team": "green",
              "prelimMark": "43.00s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2406",
              "name": "罗琳琳",
              "className": "初三孝",
              "team": "yellow",
              "prelimMark": "39.92s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "2401",
              "name": "邱天心",
              "className": "高二餐饮",
              "team": "yellow",
              "prelimMark": "39.28s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "1402",
              "name": "黄嘉欣",
              "className": "高二文商",
              "team": "red",
              "prelimMark": "43.03s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_200m_jb",
          "order": 20,
          "name": "200米",
          "group": "男乙",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 09:20 · 场次3",
          "status": "prelims_done",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "3211",
              "name": "朱振宇",
              "className": "初一忠",
              "team": "blue",
              "result": "53.93",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "2202",
              "name": "王凯翔",
              "className": "初一忠",
              "team": "yellow",
              "result": "33.73",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "1204",
              "name": "梁子康",
              "className": "初二忠",
              "team": "red",
              "result": "37.76",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 4,
              "bib": "4201",
              "name": "封胜阳",
              "className": "初一孝",
              "team": "green",
              "result": "41.49",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "1201",
              "name": "叶俊文",
              "className": "初二忠",
              "team": "red",
              "result": "31.07",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 3,
              "bib": "3209",
              "name": "郭凯杰",
              "className": "初二忠",
              "team": "blue",
              "result": "33.79",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "4203",
              "name": "陈国俊",
              "className": "初一忠",
              "team": "green",
              "result": "31.81",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "2202",
              "name": "王凯翔",
              "className": "初一忠",
              "team": "yellow",
              "prelimMark": "33.73s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "4203",
              "name": "陈国俊",
              "className": "初一忠",
              "team": "green",
              "prelimMark": "31.81s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "1201",
              "name": "叶俊文",
              "className": "初二忠",
              "team": "red",
              "prelimMark": "31.07s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "3209",
              "name": "郭凯杰",
              "className": "初二忠",
              "team": "blue",
              "prelimMark": "33.79s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_200m_sb",
          "order": 21,
          "name": "200米",
          "group": "男甲",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 09:30 · 场次4",
          "status": "prelims_done",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "1101",
              "name": "张玮轩",
              "className": "高三烘培",
              "team": "red",
              "result": "34.40",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "2103",
              "name": "伍祥豪",
              "className": "高三文商",
              "team": "yellow",
              "result": "29.95",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "3106",
              "name": "林靖翔",
              "className": "高三文商",
              "team": "blue",
              "result": "31.20",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 4,
              "bib": "4103",
              "name": "林浚韦",
              "className": "高三文商",
              "team": "green",
              "result": "31.13",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "1102",
              "name": "许凯竣",
              "className": "高三文商",
              "team": "red",
              "result": "33.79",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "4101",
              "name": "温宇豪",
              "className": "初一孝",
              "team": "green",
              "result": "31.39",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 3,
              "bib": "3103",
              "name": "黄种喻",
              "className": "高三烘培",
              "team": "blue",
              "result": "38.45",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "2101",
              "name": "王翔哲",
              "className": "高二餐饮",
              "team": "yellow",
              "result": "30.24",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "4103",
              "name": "林浚韦",
              "className": "高三文商",
              "team": "green",
              "prelimMark": "31.13s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2101",
              "name": "王翔哲",
              "className": "高二餐饮",
              "team": "yellow",
              "prelimMark": "30.24s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "2103",
              "name": "伍祥豪",
              "className": "高三文商",
              "team": "yellow",
              "prelimMark": "29.95s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "3106",
              "name": "林靖翔",
              "className": "高三文商",
              "team": "blue",
              "prelimMark": "31.20s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_800m_jg",
          "order": 22,
          "name": "800米",
          "group": "女乙",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 09:40 · 场次5",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": []
        },
        {
          "id": "ev_800m_sg",
          "order": 23,
          "name": "800米",
          "group": "女甲",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 09:55 · 场次6",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": []
        },
        {
          "id": "ev_800m_jb",
          "order": 24,
          "name": "800米",
          "group": "男乙",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 10:10 · 场次7",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": []
        },
        {
          "id": "ev_800m_sb",
          "order": 25,
          "name": "800米",
          "group": "男甲",
          "type": "track",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 10:25 · 场次8",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": []
        },
        {
          "id": "ev_jt_sb",
          "order": 26,
          "name": "标枪 (700g公开)",
          "group": "男甲",
          "type": "field",
          "isTeam": false,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 10:40 · 场次9",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": []
        },
        {
          "id": "ev_4x100_jg",
          "order": 27,
          "name": "4×100米接力",
          "group": "女乙",
          "type": "relay",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 5,
          "teamMedalRule": "relay",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 11:20 · 场次10",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1500",
              "name": "红队接力队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2500",
              "name": "黄队接力队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3500",
              "name": "蓝队接力队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4500",
              "name": "青队接力队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_4x100_sg",
          "order": 28,
          "name": "4×100米接力",
          "group": "女甲",
          "type": "relay",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 5,
          "teamMedalRule": "relay",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 11:35 · 场次11",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1400",
              "name": "红队接力队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2400",
              "name": "黄队接力队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3400",
              "name": "蓝队接力队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4400",
              "name": "青队接力队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_4x100_jb",
          "order": 29,
          "name": "4×100米接力",
          "group": "男乙",
          "type": "relay",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 5,
          "teamMedalRule": "relay",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 11:50 · 场次12",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1200",
              "name": "红队接力队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2200",
              "name": "黄队接力队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3200",
              "name": "蓝队接力队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4200",
              "name": "青队接力队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_4x100_sb",
          "order": 30,
          "name": "4×100米接力",
          "group": "男甲",
          "type": "relay",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 5,
          "teamMedalRule": "relay",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 12:05 · 场次13",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1100",
              "name": "红队接力队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2100",
              "name": "黄队接力队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3100",
              "name": "蓝队接力队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4100",
              "name": "青队接力队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_60m_jg",
          "order": 31,
          "name": "60米",
          "group": "女乙",
          "type": "track",
          "isTeam": false,
          "is60m": true,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 13:30 · 场次14",
          "status": "prelims_done",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 2,
              "bib": "1501",
              "name": "林慧萱",
              "className": "初一忠",
              "team": "red",
              "result": "13.25",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "2501",
              "name": "杨诗淇",
              "className": "初三忠",
              "team": "yellow",
              "result": "12.86",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 4,
              "bib": "4502",
              "name": "梁惠琪",
              "className": "初三孝",
              "team": "green",
              "result": "13.48",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "4501",
              "name": "曾钰昕",
              "className": "初一忠",
              "team": "green",
              "result": "14.95",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "1502",
              "name": "马萱",
              "className": "初一孝",
              "team": "red",
              "result": "10.80",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 3,
              "bib": "2502",
              "name": "方翎恩",
              "className": "初二孝",
              "team": "yellow",
              "result": "11.46",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "3502",
              "name": "娜丽莎",
              "className": "初一孝",
              "team": "blue",
              "result": "12.13",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1501",
              "name": "林慧萱",
              "className": "初一忠",
              "team": "red",
              "prelimMark": "13.25s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "3502",
              "name": "娜丽莎",
              "className": "初一孝",
              "team": "blue",
              "prelimMark": "12.13s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "2502",
              "name": "方翎恩",
              "className": "初二孝",
              "team": "yellow",
              "prelimMark": "11.46s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "1502",
              "name": "马萱",
              "className": "初一孝",
              "team": "red",
              "prelimMark": "10.80s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "2501",
              "name": "杨诗淇",
              "className": "初三忠",
              "team": "yellow",
              "prelimMark": "12.86s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "4502",
              "name": "梁惠琪",
              "className": "初三孝",
              "team": "green",
              "prelimMark": "13.48s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_60m_sg",
          "order": 32,
          "name": "60米",
          "group": "女甲",
          "type": "track",
          "isTeam": false,
          "is60m": true,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 13:35 · 场次15",
          "status": "prelims_done",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "2401",
              "name": "邱天心",
              "className": "高二餐饮",
              "team": "yellow",
              "result": "10.16",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "3409",
              "name": "黄宇洁",
              "className": "高三文商",
              "team": "blue",
              "result": "13.77",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "4402",
              "name": "林恩慧",
              "className": "高一文商",
              "team": "green",
              "result": "11.51",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 4,
              "bib": "1405",
              "name": "王芷乐",
              "className": "高二餐饮",
              "team": "red",
              "result": "11.53",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "1403",
              "name": "许柔恩",
              "className": "高三文商",
              "team": "red",
              "result": "14.43",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "2406",
              "name": "罗琳琳",
              "className": "初三孝",
              "team": "yellow",
              "result": "10.57",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 3,
              "bib": "3408",
              "name": "黄滢颖",
              "className": "初三孝",
              "team": "blue",
              "result": "10.64",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "4401",
              "name": "胡巧微",
              "className": "高三烘培",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1405",
              "name": "王芷乐",
              "className": "高二餐饮",
              "team": "red",
              "prelimMark": "11.53s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "3408",
              "name": "黄滢颖",
              "className": "初三孝",
              "team": "blue",
              "prelimMark": "10.64s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "2406",
              "name": "罗琳琳",
              "className": "初三孝",
              "team": "yellow",
              "prelimMark": "10.57s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "2401",
              "name": "邱天心",
              "className": "高二餐饮",
              "team": "yellow",
              "prelimMark": "10.16s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "4402",
              "name": "林恩慧",
              "className": "高一文商",
              "team": "green",
              "prelimMark": "11.51s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "3409",
              "name": "黄宇洁",
              "className": "高三文商",
              "team": "blue",
              "prelimMark": "13.77s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_60m_jb",
          "order": 33,
          "name": "60米",
          "group": "男乙",
          "type": "track",
          "isTeam": false,
          "is60m": true,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 13:40 · 场次16",
          "status": "prelims_done",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "1201",
              "name": "叶俊文",
              "className": "初二忠",
              "team": "red",
              "result": "8.06",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "4201",
              "name": "封胜阳",
              "className": "初一孝",
              "team": "green",
              "result": "11.35",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 3,
              "bib": "3206",
              "name": "黄榀喆",
              "className": "初一忠",
              "team": "blue",
              "result": "10.03",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 4,
              "bib": "2201",
              "name": "林凯泽",
              "className": "初三忠",
              "team": "yellow",
              "result": "9.89",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "4202",
              "name": "陈伟扬",
              "className": "初一忠",
              "team": "green",
              "result": "11.00",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 3,
              "bib": "1205",
              "name": "黄柏杰",
              "className": "初二孝",
              "team": "red",
              "result": "9.77",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "3202",
              "name": "林纮宇",
              "className": "初三忠",
              "team": "blue",
              "result": "13.53",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "4202",
              "name": "陈伟扬",
              "className": "初一忠",
              "team": "green",
              "prelimMark": "11.00s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2201",
              "name": "林凯泽",
              "className": "初三忠",
              "team": "yellow",
              "prelimMark": "9.89s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "1205",
              "name": "黄柏杰",
              "className": "初二孝",
              "team": "red",
              "prelimMark": "9.77s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "1201",
              "name": "叶俊文",
              "className": "初二忠",
              "team": "red",
              "prelimMark": "8.06s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "3206",
              "name": "黄榀喆",
              "className": "初一忠",
              "team": "blue",
              "prelimMark": "10.03s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "4201",
              "name": "封胜阳",
              "className": "初一孝",
              "team": "green",
              "prelimMark": "11.35s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_60m_sb",
          "order": 34,
          "name": "60米",
          "group": "男甲",
          "type": "track",
          "isTeam": false,
          "is60m": true,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 1,
          "teamMedalRule": "individual",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 13:45 · 场次17",
          "status": "prelims_done",
          "prelimEntries": [
            {
              "heat": 1,
              "lane": 1,
              "bib": "4102",
              "name": "黄俊铭",
              "className": "高一餐饮",
              "team": "green",
              "result": "9.10",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 2,
              "bib": "2101",
              "name": "王翔哲",
              "className": "高二餐饮",
              "team": "yellow",
              "result": "8.34",
              "status": "OK"
            },
            {
              "heat": 1,
              "lane": 4,
              "bib": "3105",
              "name": "林韦仁",
              "className": "高二餐饮",
              "team": "blue",
              "result": "9.19",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 1,
              "bib": "4101",
              "name": "温宇豪",
              "className": "初一孝",
              "team": "green",
              "result": "8.68",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 2,
              "bib": "3101",
              "name": "邹捷贺",
              "className": "高三烘培",
              "team": "blue",
              "result": "9.79",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 3,
              "bib": "1102",
              "name": "许凯竣",
              "className": "高三文商",
              "team": "red",
              "result": "8.88",
              "status": "OK"
            },
            {
              "heat": 2,
              "lane": 4,
              "bib": "2102",
              "name": "朱宇章",
              "className": "高三烘培",
              "team": "yellow",
              "result": "7.80",
              "status": "OK"
            }
          ],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "4102",
              "name": "黄俊铭",
              "className": "高一餐饮",
              "team": "green",
              "prelimMark": "9.10s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "4101",
              "name": "温宇豪",
              "className": "初一孝",
              "team": "green",
              "prelimMark": "8.68s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "2101",
              "name": "王翔哲",
              "className": "高二餐饮",
              "team": "yellow",
              "prelimMark": "8.34s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "2102",
              "name": "朱宇章",
              "className": "高三烘培",
              "team": "yellow",
              "prelimMark": "7.80s",
              "qualBadge": "Q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 5,
              "bib": "1102",
              "name": "许凯竣",
              "className": "高三文商",
              "team": "red",
              "prelimMark": "8.88s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 6,
              "bib": "3105",
              "name": "林韦仁",
              "className": "高二餐饮",
              "team": "blue",
              "prelimMark": "9.19s",
              "qualBadge": "q",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_tug_all",
          "order": 35,
          "name": "大队拔河 (4男4女)",
          "group": "公开",
          "type": "tug",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 8,
          "teamMedalRule": "tug_or_grand",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 13:50-14:00 · 场次18-19",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1000",
              "name": "红队拔河代表队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2000",
              "name": "黄队拔河代表队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3000",
              "name": "蓝队拔河代表队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4000",
              "name": "青队拔河代表队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_4x400_jg",
          "order": 36,
          "name": "4×400米接力",
          "group": "女乙",
          "type": "relay",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 5,
          "teamMedalRule": "relay",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 14:10 · 场次20",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1500",
              "name": "红队4×400接力队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2500",
              "name": "黄队4×400接力队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3500",
              "name": "蓝队4×400接力队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4500",
              "name": "青队4×400接力队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_4x400_sg",
          "order": 37,
          "name": "4×400米接力",
          "group": "女甲",
          "type": "relay",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 5,
          "teamMedalRule": "relay",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 14:20 · 场次21",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1400",
              "name": "红队4×400接力队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2400",
              "name": "黄队4×400接力队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3400",
              "name": "蓝队4×400接力队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4400",
              "name": "青队4×400接力队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_4x400_jb",
          "order": 38,
          "name": "4×400米接力",
          "group": "男乙",
          "type": "relay",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 5,
          "teamMedalRule": "relay",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 14:30 · 场次22",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1200",
              "name": "红队4×400接力队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2200",
              "name": "黄队4×400接力队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3200",
              "name": "蓝队4×400接力队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4200",
              "name": "青队4×400接力队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_4x400_sb",
          "order": 39,
          "name": "4×400米接力",
          "group": "男甲",
          "type": "relay",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 5,
          "teamMedalRule": "relay",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 14:40 · 场次23",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1100",
              "name": "红队4×400接力队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2100",
              "name": "黄队4×400接力队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3100",
              "name": "蓝队4×400接力队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4100",
              "name": "青队4×400接力队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        },
        {
          "id": "ev_grand_8x200",
          "order": 40,
          "name": "大队接力 8×200米 (4男4女)",
          "group": "公开",
          "type": "relay",
          "isTeam": true,
          "is60m": false,
          "windCheck": false,
          "wind": "",
          "physicalMedalCount": 8,
          "teamMedalRule": "tug_or_grand",
          "recordMark": "",
          "recordHolder": "",
          "scheduleTime": "02/12 14:50 · 场次24",
          "status": "startlist",
          "prelimEntries": [],
          "finalEntries": [
            {
              "lane": 1,
              "bib": "1000",
              "name": "红队大队接力队",
              "className": "色队代表",
              "team": "red",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 2,
              "bib": "2000",
              "name": "黄队大队接力队",
              "className": "色队代表",
              "team": "yellow",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 3,
              "bib": "3000",
              "name": "蓝队大队接力队",
              "className": "色队代表",
              "team": "blue",
              "result": "",
              "status": "OK"
            },
            {
              "lane": 4,
              "bib": "4000",
              "name": "青队大队接力队",
              "className": "色队代表",
              "team": "green",
              "result": "",
              "status": "OK"
            }
          ]
        }
      ]
    };
  }

  function createDefaultTvCommand(state) {
    var firstFinished = (state.events || []).find(function (e) { return e.status === 'finished'; }) || (state.events && state.events[0]);
    return {
      mode: 'standings',
      eventId: firstFinished ? firstFinished.id : '',
      urgentNotice: '',
      playFanfareAt: 0,
      pushedAt: Date.now()
    };
  }

  // =========================================================================
  // 8. 持久化与 BroadcastChannel + localStorage 双保险跨屏同步
  // =========================================================================
  var bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_STATE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.events)) return parsed;
      }
    } catch (e) { /* ignore */ }
    var def = createDefaultState();
    saveState(def, false, true);
    return def;
  }

  function saveState(state, shouldBroadcast, preserveUpdatedAt) {
    state.meta = state.meta || {};
    if (!preserveUpdatedAt || !state.meta.updatedAt) {
      state.meta.updatedAt = new Date().toISOString();
    }
    try {
      localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
    if (shouldBroadcast !== false) {
      broadcastMessage({ type: 'STATE_UPDATED', state: state, ts: Date.now() });
    }
  }

  function loadTvCommand(state) {
    try {
      var raw = localStorage.getItem(STORAGE_TV_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.mode) return parsed;
      }
    } catch (e) { /* ignore */ }
    var def = createDefaultTvCommand(state || loadState());
    try { localStorage.setItem(STORAGE_TV_KEY, JSON.stringify(def)); } catch (e) { /* ignore */ }
    return def;
  }

  function pushTvCommand(cmd) {
    var payload = Object.assign({}, loadTvCommand(), cmd, { pushedAt: Date.now() });
    try {
      localStorage.setItem(STORAGE_TV_KEY, JSON.stringify(payload));
    } catch (e) { /* ignore */ }
    broadcastMessage({ type: 'TV_COMMAND', command: payload, ts: Date.now() });
    return payload;
  }

  function broadcastMessage(msg) {
    if (bc) {
      try { bc.postMessage(msg); } catch (e) { /* ignore */ }
    }
  }

  function subscribeSync(onStateChange, onTvCommand) {
    var lastSeenStateAt = (loadState().meta || {}).updatedAt || '';
    var lastSeenTvAt = (loadTvCommand().pushedAt) || 0;

    if (bc) {
      bc.onmessage = function (ev) {
        if (!ev || !ev.data) return;
        if (ev.data.type === 'STATE_UPDATED' && onStateChange) {
          var st = ev.data.state || loadState();
          lastSeenStateAt = (st.meta || {}).updatedAt || lastSeenStateAt;
          onStateChange(st);
        } else if (ev.data.type === 'TV_COMMAND' && onTvCommand) {
          var cmd = ev.data.command || loadTvCommand();
          lastSeenTvAt = cmd.pushedAt || lastSeenTvAt;
          onTvCommand(cmd);
        }
      };
    }
    global.addEventListener('storage', function (ev) {
      if (ev.key === STORAGE_STATE_KEY && onStateChange) {
        var st = loadState();
        lastSeenStateAt = (st.meta || {}).updatedAt || lastSeenStateAt;
        onStateChange(st);
      } else if (ev.key === STORAGE_TV_KEY && onTvCommand) {
        var cmd = loadTvCommand();
        lastSeenTvAt = cmd.pushedAt || lastSeenTvAt;
        onTvCommand(cmd);
      }
    });

    // file:// 双击打开时部分浏览器会隔离 BroadcastChannel，提供轻量级轮询兜底
    if (global.location && global.location.protocol === 'file:') {
      setInterval(function () {
        var st = loadState();
        var stAt = (st.meta || {}).updatedAt || '';
        if (stAt && stAt !== lastSeenStateAt) {
          lastSeenStateAt = stAt;
          if (onStateChange) onStateChange(st);
        }
        var cmd = loadTvCommand(st);
        if (cmd.pushedAt && cmd.pushedAt !== lastSeenTvAt) {
          lastSeenTvAt = cmd.pushedAt;
          if (onTvCommand) onTvCommand(cmd);
        }
      }, 800);
    }
  }

  // =========================================================================
  // 9. SheetJS Excel 纯前端导入、导出归档、下载报名模板
  // =========================================================================
  function ensureXLSX() {
    if (typeof global.XLSX === 'undefined') {
      throw new Error('SheetJS (XLSX) 尚未加载，请检查网络或刷新重试。');
    }
    return global.XLSX;
  }

  function downloadTemplateExcel() {
    var XLSX = ensureXLSX();
    var wb = XLSX.utils.book_new();

    var regRows = [
      ['项目名称', '组别', '项目类型(径赛/田赛/接力/拔河)', '是否团体赛(是/否)', '是否60米6道(是/否)', '阶段(预赛/决赛)', '预赛分组', '道次', '运动员编号(4位)', '姓名', '班级', '队伍(红/黄/蓝/青)', '成绩(径赛秒或分:秒/田赛米)', '试跳2', '试跳3', '状态(OK/DNS/DNF/DQ)', '大会纪录'],
      ['100米', '男甲', '径赛', '否', '否', '预赛', 1, 2, '1101', '林宇轩', '高二理1', '红', '11.42', '', '', 'OK', '11.35'],
      ['100米', '男甲', '径赛', '否', '否', '预赛', 2, 2, '2102', '李浩然', '高三理1', '黄', '11.38', '', '', 'OK', '11.35'],
      ['跳远', '女甲', '田赛', '否', '否', '决赛', 1, 1, '1402', '杨思琪', '高三理1', '红', '5.04', '5.21', '5.15', 'OK', '5.12'],
      ['4×100米接力', '男甲', '接力', '是', '否', '决赛', 1, 3, '1100', '红队男甲接力队', '高中代表队', '红', '44.62', '', '', 'OK', '44.80']
    ];
    var ws1 = XLSX.utils.aoa_to_sheet(regRows);
    XLSX.utils.book_append_sheet(wb, ws1, '报名与成绩导入表');

    var guideRows = [
      ['新民独立中学 2026 运动会 Excel 导入规则说明'],
      ['1. 4位数编号规则（章程第14条）', '第1位=队伍(1红,2黄,3蓝,4青)；第2位=组别(1男甲,2男乙,4女甲,5女乙)；后2位=序号'],
      ['2. 号码布颜色（章程第13条）', '甲组（男甲/女甲）自动匹配白色号码布；乙组（男乙/女乙）自动匹配黄色号码布'],
      ['3. 积分规则（章程第10.2条）', '个人决赛前五名: 7,5,3,2,1分；团体决赛前五名: 10,7,5,3,1分；预赛不计分'],
      ['4. 实体奖牌数量（章程第9条）', '个人赛前3名各1面；接力赛前3名各5面；拔河与大队接力前3名各8面']
    ];
    var ws2 = XLSX.utils.aoa_to_sheet(guideRows);
    XLSX.utils.book_append_sheet(wb, ws2, '填表与章程说明');

    XLSX.writeFile(wb, '新民独立中学2026运动会_报名与成绩导入模板.xlsx');
  }

  function isOfficialMeetWorkbook(XLSX, wb) {
    for (var i = 0; i < wb.SheetNames.length; i++) {
      var ws = wb.Sheets[wb.SheetNames[i]];
      var a1 = ws && ws.A1 ? String(ws.A1.v || '').trim() : '';
      if (a1.indexOf('亚罗士打新民独立中学运动会') !== -1 || a1.indexOf('新民独立中学运动会') !== -1) {
        return true;
      }
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      for (var r = 0; r < Math.min(8, aoa.length); r++) {
        var rowStr = (aoa[r] || []).join(' ');
        if (rowStr.indexOf('2026年') !== -1 && (rowStr.indexOf('新民') !== -1 || rowStr.indexOf('场次') !== -1)) {
          return true;
        }
      }
    }
    return false;
  }

  function parseOfficialMeetWorkbook(XLSX, wb, currentState) {
    var nextState = JSON.parse(JSON.stringify(currentState || createDefaultState()));
    var eventById = {};
    var eventByKey = {};
    nextState.events.forEach(function (ev) {
      eventById[ev.id] = ev;
      eventByKey[ev.group + '||' + ev.name] = ev;
    });

    function cleanCell(v) {
      return v === undefined || v === null ? '' : String(v).trim();
    }

    function ensureEvent(group, name, type, isTeam, is60m) {
      var k = group + '||' + name;
      if (eventByKey[k]) return eventByKey[k];
      var medalRule = (name.indexOf('拔河') !== -1 || name.indexOf('大队') !== -1) ? 'tug_or_grand' : (isTeam ? 'relay' : 'individual');
      var ev = {
        id: 'ev_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        order: nextState.events.length + 1,
        name: name,
        group: group,
        type: type,
        isTeam: !!isTeam,
        is60m: !!is60m,
        windCheck: false,
        wind: '',
        physicalMedalCount: medalRule === 'tug_or_grand' ? 8 : (medalRule === 'relay' ? 5 : 1),
        teamMedalRule: medalRule,
        recordMark: '',
        recordHolder: '',
        scheduleTime: '',
        status: 'startlist',
        prelimEntries: [],
        finalEntries: []
      };
      nextState.events.push(ev);
      eventByKey[k] = ev;
      return ev;
    }

    function findMatchingEvent(grp, rawProj) {
      var cleanProj = rawProj.replace(/决赛|半决赛\s*\d*/g, '').trim().replace(/m$/i, '米').trim();
      var candidates = [cleanProj];
      if (cleanProj === '铅球') candidates.push('铅球 (3kg)', '铅球 (4kg)', '铅球 (5kg)');
      if (cleanProj === '标枪') candidates.push('标枪 (500g公开)', '标枪 (700g公开)');
      var cleanGrp = grp.replace(/（公开）|\(公开\)|组/g, '').trim();
      for (var i = 0; i < candidates.length; i++) {
        if (eventByKey[cleanGrp + '||' + candidates[i]]) return eventByKey[cleanGrp + '||' + candidates[i]];
      }
      var isField = /跳|铅球|标枪/.test(cleanProj);
      return ensureEvent(cleanGrp, cleanProj, isField ? 'field' : 'track', false, cleanProj.indexOf('60') !== -1);
    }

    function upsertEntry(arr, entry) {
      var idx = arr.findIndex(function (x) {
        return (entry.bib && x.bib === entry.bib) || (x.name === entry.name && x.lane === entry.lane);
      });
      if (!entry.className) {
        var st = findLocalStudent(entry.name);
        if (st && st.className) entry.className = st.className;
      }
      if (idx >= 0) {
        arr[idx] = Object.assign({}, arr[idx], entry);
      } else {
        arr.push(entry);
      }
    }

    var seenBlocks = {};
    var importedCount = 0;

    wb.SheetNames.forEach(function (shName) {
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets[shName], { header: 1, defval: '' });
      for (var r = 0; r < aoa.length; r++) {
        var c0 = cleanCell(aoa[r][0]);
        if (c0.indexOf('2026年') !== 0) continue;

        var metaRow = aoa[r + 2] || [];
        var grpRaw = cleanCell(metaRow[1]).replace(/组$/, '');
        var projRaw = '';
        for (var ci = 5; ci < Math.min(16, metaRow.length); ci++) {
          var v = cleanCell(metaRow[ci]);
          if (v && v.indexOf('项目') === -1) {
            projRaw = v;
            break;
          }
        }
        if (!grpRaw || !projRaw) continue;

        var hdrRow = aoa[r + 6] || [];
        var firstHdr = cleanCell(hdrRow[0]);

        // 1) 径赛横排格式（第 r+6 行以「道次」开头）
        if (firstHdr === '道次') {
          var bibRow = aoa[r + 7] || [];
          var nameRow = aoa[r + 8] || [];
          var markRow = aoa[r + 11] || [];
          var mHeat = projRaw.match(/半决赛\s*(\d+)?/);
          var isPrelim = !!mHeat;
          var heatNum = mHeat ? Number(mHeat[1] || 1) : 1;
          var sig = grpRaw + '|' + projRaw;
          var sigBibs = [];
          for (var lc = 1; lc < hdrRow.length; lc++) {
            if (bibRow[lc]) sigBibs.push(cleanCell(hdrRow[lc]) + ':' + cleanCell(bibRow[lc]));
          }
          sig += '|' + sigBibs.join(',');
          if (seenBlocks[sig]) continue;
          seenBlocks[sig] = true;

          var targetEv = findMatchingEvent(grpRaw, projRaw);
          var hasAnyFinishMark = false;
          for (var col = 1; col < hdrRow.length; col++) {
            var laneStr = cleanCell(hdrRow[col]);
            if (!/^\d+$/.test(laneStr)) continue;
            var bib = cleanCell(bibRow[col]);
            var name = cleanCell(nameRow[col]);
            if (!bib && !name) continue;
            var sec = parseTrackTimeToSeconds(markRow[col]);
            var formatted = sec !== null ? formatTrackSeconds(sec) : '';
            if (formatted && !isPrelim) hasAnyFinishMark = true;
            var pBib = parseBib(bib);
            var entry = {
              heat: heatNum,
              lane: Number(laneStr),
              bib: bib,
              name: name,
              className: '',
              team: pBib.team || 'red',
              result: formatted,
              status: 'OK'
            };
            upsertEntry(isPrelim ? targetEv.prelimEntries : targetEv.finalEntries, entry);
            importedCount++;
          }
          if (!isPrelim && hasAnyFinishMark) targetEv.status = 'finished';
          else if (isPrelim && targetEv.status === 'startlist') targetEv.status = 'prelims_done';
          continue;
        }

        // 2) 田赛（铅球 / 标枪）或 跳高 纵排格式（第 r+6 行以「号码」开头）
        if (firstHdr === '号码') {
          var isHighJump = projRaw.indexOf('跳高') !== -1 || cleanCell(hdrRow[3]).indexOf('cm') !== -1;
          var targetFieldEv = findMatchingEvent(grpRaw, projRaw);
          var rr = r + 7;
          var laneIdx = 1;

          if (!isHighJump) {
            var blockHasMark = false;
            while (rr < aoa.length) {
              var rowT = aoa[rr] || [];
              var bT = cleanCell(rowT[0]);
              if (!bT || bT.indexOf('检录') === 0 || bT.indexOf('2026年') === 0) break;
              var nT = cleanCell(rowT[1]);
              if (nT) {
                var rawNote = cleanCell(rowT[12]);
                var stT = rawNote.indexOf('犯规') !== -1 ? 'DQ' : 'OK';
                var bestNum = parseFieldMark(rowT[10]);
                var atts = [rowT[3], rowT[4], rowT[5], rowT[7], rowT[8], rowT[9]].map(function (cell) {
                  var cStr = cleanCell(cell).toUpperCase();
                  if (cStr === 'X') return 'X';
                  var v = parseFieldMark(cell);
                  if (v === null) return '';
                  if (bestNum !== null && v > bestNum + 1e-6) return '';
                  return v.toFixed(2);
                });
                var bestStr = bestNum !== null && stT === 'OK' ? bestNum.toFixed(2) : '';
                if (bestStr) {
                  var hasBestInAtts = atts.some(function (a) {
                    var av = parseFieldMark(a);
                    return av !== null && Math.abs(av - bestNum) <= 1e-6;
                  });
                  if (!hasBestInAtts) {
                    var emptyPos = atts.indexOf('');
                    if (emptyPos >= 0) atts[emptyPos] = bestStr;
                  }
                  blockHasMark = true;
                }
                upsertEntry(targetFieldEv.finalEntries, {
                  lane: laneIdx++,
                  bib: bT,
                  name: nT,
                  className: cleanCell(rowT[2]),
                  team: parseBib(bT).team || 'red',
                  attempt1: atts[0],
                  attempt2: atts[1],
                  attempt3: atts[2],
                  attempt4: atts[3],
                  attempt5: atts[4],
                  attempt6: atts[5],
                  result: bestStr,
                  status: stT,
                  note: stT === 'DQ' ? rawNote : ''
                });
                importedCount++;
              }
              rr++;
            }
            if (blockHasMark) targetFieldEv.status = 'finished';
          } else {
            // 跳高格式：解析高度列与 O/X/-
            var hCols = [];
            for (var hc = 3; hc < hdrRow.length; hc++) {
              var hm = cleanCell(hdrRow[hc]).match(/^(\d+)(?:cm|m)$/i);
              if (hm) hCols.push({ col: hc, cm: Number(hm[1]) });
            }
            var hjHasMarks = false;
            var hjRows = [];
            while (rr < aoa.length) {
              var rowH = aoa[rr] || [];
              var bH = cleanCell(rowH[0]);
              if (!bH || bH.indexOf('检录') === 0 || bH.indexOf('2026年') === 0) break;
              var nH = cleanCell(rowH[1]);
              if (nH) {
                for (var kc = 3; kc < Math.min(rowH.length, 37); kc++) {
                  if (cleanCell(rowH[kc])) hjHasMarks = true;
                }
                hjRows.push(rowH);
              }
              rr++;
            }
            hjRows.forEach(function (rowH) {
              var bH = cleanCell(rowH[0]);
              var nH = cleanCell(rowH[1]);
              var clearedCm = null;
              var failsAtBest = 0;
              var totalFails = 0;
              var notes = [];
              for (var hi = 0; hi < hCols.length; hi++) {
                var cStart = hCols[hi].col;
                var cEnd = hi + 1 < hCols.length ? hCols[hi + 1].col : cStart + 3;
                var seq = '';
                for (var cc = cStart; cc < cEnd; cc++) seq += cleanCell(rowH[cc]).toUpperCase().replace(/0/g, 'O');
                if (seq) notes.push(hCols[hi].cm + '(' + seq + ')');
                var xCount = (seq.match(/X/g) || []).length;
                if (seq.indexOf('O') !== -1) {
                  clearedCm = hCols[hi].cm;
                  failsAtBest = xCount;
                  totalFails += xCount;
                }
              }
              var hjEntry = {
                lane: laneIdx++,
                bib: bH,
                name: STUDENT_NAME_ALIASES[nH] || nH,
                className: cleanCell(rowH[2]),
                team: parseBib(bH).team || 'red',
                result: !hjHasMarks ? '' : (clearedCm !== null ? (clearedCm / 100).toFixed(2) : ''),
                attempt1: clearedCm !== null ? (clearedCm / 100).toFixed(2) : '',
                note: notes.length ? notes.slice(-2).join(' ') : (hjHasMarks ? '未出赛' : ''),
                status: !hjHasMarks ? 'OK' : (clearedCm !== null ? 'OK' : 'NM')
              };
              if (clearedCm !== null) {
                hjEntry.tieBreakVal = failsAtBest * 100 + totalFails;
              }
              upsertEntry(targetFieldEv.finalEntries, hjEntry);
              importedCount++;
            });
            if (hjHasMarks) targetFieldEv.status = 'finished';
          }
        }
      }
    });

    return { state: nextState, importedCount: importedCount };
  }

  function importWorkbookArrayBuffer(arrayBuffer, currentState) {
    var XLSX = ensureXLSX();
    var data = new Uint8Array(arrayBuffer);
    var wb = XLSX.read(data, { type: 'array' });
    if (isOfficialMeetWorkbook(XLSX, wb)) {
      return parseOfficialMeetWorkbook(XLSX, wb, currentState);
    }
    var firstSheet = wb.SheetNames[0];
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { defval: '' });
    if (!rows || rows.length === 0) {
      throw new Error('表格内容为空，请检查第一张工作表。');
    }
    return mergeImportedRows(rows, currentState);
  }

  function importExcelFile(file, currentState) {
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            resolve(importWorkbookArrayBuffer(e.target.result, currentState));
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = function () { reject(new Error('读取文件失败')); };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        reject(err);
      }
    });
  }

  function mergeImportedRows(rows, currentState) {
    var nextState = JSON.parse(JSON.stringify(currentState || createDefaultState()));
    var eventIndexByKey = {};
    nextState.events.forEach(function (ev, idx) {
      eventIndexByKey[ev.group + '||' + ev.name] = idx;
    });

    function pick(row, keys) {
      for (var i = 0; i < keys.length; i++) {
        if (row[keys[i]] !== undefined && row[keys[i]] !== '') return row[keys[i]];
      }
      return '';
    }

    var importedCount = 0;
    rows.forEach(function (row) {
      var eventName = String(pick(row, ['项目名称', '项目', 'Event', 'eventName'])).trim();
      if (!eventName) return;

      var bib = String(pick(row, ['运动员编号(4位)', '运动员编号', '编号', 'Bib', 'bib'])).trim();
      var parsedBib = parseBib(bib);

      var group = String(pick(row, ['组别', 'Group', 'group'])).trim() || parsedBib.group || '男甲';
      var teamRaw = pick(row, ['队伍(红/黄/蓝/青)', '队伍', '色队', 'Team', 'team']);
      var team = teamRaw ? normalizeTeamId(teamRaw) : (parsedBib.team || 'red');

      var typeRaw = String(pick(row, ['项目类型(径赛/田赛/接力/拔河)', '项目类型', '类型', 'Type'])).trim();
      var type = 'track';
      if (typeRaw.indexOf('田') !== -1 || /跳|掷|铅|铁|标/.test(eventName)) type = 'field';
      else if (typeRaw.indexOf('拔河') !== -1 || eventName.indexOf('拔河') !== -1) type = 'tug';
      else if (typeRaw.indexOf('接力') !== -1 || eventName.indexOf('接力') !== -1) type = 'relay';

      var isTeamRaw = String(pick(row, ['是否团体赛(是/否)', '是否团体赛', '团体赛'])).trim();
      var isTeam = isTeamRaw === '是' || isTeamRaw.toLowerCase() === 'true' || type === 'relay' || type === 'tug';
      var is60mRaw = String(pick(row, ['是否60米6道(是/否)', '是否60米', '60米'])).trim();
      var is60m = is60mRaw === '是' || eventName.indexOf('60') !== -1;

      var recordMark = String(pick(row, ['大会纪录', '纪录', 'Record'])).trim();
      var stageRaw = String(pick(row, ['阶段(预赛/决赛)', '阶段', 'Stage'])).trim();
      var isPrelim = stageRaw.indexOf('预') !== -1 || stageRaw.indexOf('初') !== -1 || stageRaw.toLowerCase() === 'prelim';

      var key = group + '||' + eventName;
      var evIdx = eventIndexByKey[key];
      if (evIdx === undefined) {
        var medalRule = (eventName.indexOf('拔河') !== -1 || eventName.indexOf('大队') !== -1) ? 'tug_or_grand' : (isTeam ? 'relay' : 'individual');
        var newEv = {
          id: 'ev_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          order: nextState.events.length + 1,
          name: eventName,
          group: group,
          type: type,
          isTeam: isTeam,
          is60m: is60m,
          windCheck: false,
          wind: '',
          physicalMedalCount: medalRule === 'tug_or_grand' ? 8 : (medalRule === 'relay' ? 5 : 1),
          teamMedalRule: medalRule,
          recordMark: recordMark,
          recordHolder: '',
          scheduleTime: '',
          status: isPrelim ? 'prelims_done' : 'startlist',
          prelimEntries: [],
          finalEntries: []
        };
        nextState.events.push(newEv);
        evIdx = nextState.events.length - 1;
        eventIndexByKey[key] = evIdx;
      }

      var targetEv = nextState.events[evIdx];
      if (recordMark && !targetEv.recordMark) targetEv.recordMark = recordMark;

      var entry = {
        heat: Number(pick(row, ['预赛分组', '分组', 'Heat']) || 1),
        lane: Number(pick(row, ['道次', 'Lane']) || 1),
        bib: bib,
        name: String(pick(row, ['姓名', '选手', '队伍名称', 'Name'])).trim() || ('选手 ' + bib),
        className: String(pick(row, ['班级', 'Class'])).trim(),
        team: team,
        group: group,
        result: String(pick(row, ['成绩(径赛秒或分:秒/田赛米)', '成绩', 'Result', '试跳1'])).trim(),
        attempt1: String(pick(row, ['试跳1', '成绩(径赛秒或分:秒/田赛米)', '成绩'])).trim(),
        attempt2: String(pick(row, ['试跳2'])).trim(),
        attempt3: String(pick(row, ['试跳3'])).trim(),
        status: String(pick(row, ['状态(OK/DNS/DNF/DQ)', '状态', 'Status']) || 'OK').trim().toUpperCase()
      };

      var arr = isPrelim ? targetEv.prelimEntries : targetEv.finalEntries;
      var existingIdx = arr.findIndex(function (x) { return (bib && x.bib === bib) || (x.name === entry.name && x.lane === entry.lane); });
      if (existingIdx >= 0) {
        arr[existingIdx] = Object.assign(arr[existingIdx], entry);
      } else {
        arr.push(entry);
      }

      if (!isPrelim && entry.result) {
        targetEv.status = 'finished';
      }
      importedCount++;
    });

    return { state: nextState, importedCount: importedCount };
  }

  function exportArchiveExcel(state) {
    var XLSX = ensureXLSX();
    var standings = computeStandings(state);
    var wb = XLSX.utils.book_new();

    // Sheet 1: 四色总积分与奖牌榜
    var s1 = [['排名', '色队', '总积分', '金牌', '银牌', '铜牌', '实体奖牌总计']];
    standings.rankedTeams.forEach(function (t) {
      s1.push([t.rank, t.name, t.points, t.gold, t.silver, t.bronze, t.physicalMedals]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1), '1_四色总积分与奖牌榜');

    // Sheet 2: 最佳运动员奖杯
    var s2 = [['组别', '最佳运动员(个人项目最多金牌)', '编号', '色队', '个人金牌数', '获奖项目', '是否并列共享']];
    GROUP_ORDER.forEach(function (grp) {
      var info = standings.bestAthletes[grp];
      if (!info || info.leaders.length === 0) {
        s2.push([grp, '暂无个人金牌记录', '-', '-', 0, '-', '否']);
      } else {
        info.leaders.forEach(function (l) {
          s2.push([grp, l.name, l.bib, TEAMS[l.team].name, l.golds, l.events.join('、'), info.shared ? '是 (共享)' : '否']);
        });
      }
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), '2_最佳运动员奖杯');

    // Sheet 3: 决赛完整成绩单
    var s3 = [['项目', '组别', '类型', '名次', '道次', '编号', '号码布', '姓名', '班级', '色队', '成绩', '得分', '破大会纪录', '状态']];
    (state.events || []).forEach(function (ev) {
      var computed = calculateEntries(ev.finalEntries || [], ev, true);
      computed.forEach(function (entry) {
        var tid = normalizeTeamId(entry.team);
        var bibCol = '白色(' + getDivisionLabel(entry.group || ev.group) + ')';
        s3.push([
          ev.name,
          ev.group,
          ev.isTeam ? '团体赛' : '个人赛',
          entry.rank || '-',
          entry.lane || '-',
          entry.bib || '-',
          bibCol,
          entry.name,
          entry.className || '-',
          TEAMS[tid].name,
          formatMarkDisplay(entry, ev),
          entry.points || 0,
          entry.isRecord ? 'NEW RECORD (破纪录)' : '',
          entry.status || 'OK'
        ]);
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3), '3_决赛完整成绩单');

    // Sheet 4: 预赛与晋级总表
    var s4 = [['项目', '组别', '预赛分组', '道次', '编号', '姓名', '班级', '色队', '成绩', '组内名次', '晋级标识', '状态']];
    (state.events || []).forEach(function (ev) {
      if (!ev.prelimEntries || ev.prelimEntries.length === 0) return;
      var qInfo = computePrelimQualifiers(ev);
      qInfo.entries.forEach(function (entry) {
        var tid = normalizeTeamId(entry.team);
        s4.push([
          ev.name,
          ev.group,
          '第' + (entry.heat || 1) + '组',
          entry.lane || '-',
          entry.bib || '-',
          entry.name,
          entry.className || '-',
          TEAMS[tid].name,
          formatMarkDisplay(entry, ev),
          entry.heatRank || '-',
          entry.qualBadge ? '✓ 晋级决赛' : '-',
          entry.status || 'OK'
        ]);
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s4), '4_预赛与晋级总表');

    // Sheet 5: 颁奖台实体奖牌核算表
    var s5 = [['已完赛项目', '前3名每队应发奖牌数', '红队实领', '黄队实领', '蓝队实领', '青队实领']];
    standings.physicalBreakdown.forEach(function (row) {
      s5.push([row.eventName, row.multiplier, row.red, row.yellow, row.blue, row.green]);
    });
    s5.push([
      '各队实体奖牌总计',
      '-',
      standings.teamsMap.red.physicalMedals,
      standings.teamsMap.yellow.physicalMedals,
      standings.teamsMap.blue.physicalMedals,
      standings.teamsMap.green.physicalMedals
    ]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s5), '5_颁奖台实体奖牌核算表');

    var dateTag = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, '新民独立中学2026运动会_完整成绩归档_' + dateTag + '.xlsx');
  }

  // =========================================================================
  // 10. Google Sheets 实时同步（CSV 读取与 Apps Script 写入）
  // =========================================================================
  function fetchFromGoogleSheetsCsv(csvUrl, currentState) {
    if (!csvUrl) return Promise.reject(new Error('尚未填写 Google Sheets CSV 发布链接'));
    var XLSX = ensureXLSX();
    var bustUrl = csvUrl + (csvUrl.indexOf('?') === -1 ? '?' : '&') + '_t=' + Date.now();
    return fetch(bustUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' 无法获取 Google Sheets');
        return res.text();
      })
      .then(function (csvText) {
        var wb = XLSX.read(csvText, { type: 'string' });
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        if (!rows || rows.length === 0) throw new Error('Google Sheets 返回空表格');
        return mergeImportedRows(rows, currentState);
      });
  }

  function pushToGoogleAppsScript(webhookUrl, state) {
    if (!webhookUrl) return Promise.resolve({ skipped: true });
    var standings = computeStandings(state);
    return fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        rankedTeams: standings.rankedTeams,
        events: state.events
      })
    });
  }

  // =========================================================================
  // 10.5 GitHub 云端 live-state.json 手机端拉取 & 记录台直推
  // =========================================================================
  function getSavedGithubToken() {
    try { return localStorage.getItem(STORAGE_GH_TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function saveGithubToken(token) {
    try {
      if (token) localStorage.setItem(STORAGE_GH_TOKEN_KEY, token.trim());
      else localStorage.removeItem(STORAGE_GH_TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  function fetchFromRemoteStateJson(repoOwnerRepo, currentState, force, preferRawFirst) {
    var repo = String(repoOwnerRepo || (currentState && currentState.meta && currentState.meta.githubRepo) || DEFAULT_GITHUB_REPO).trim();
    var urls = [];
    var rawUrl = repo ? ('https://raw.githubusercontent.com/' + repo + '/main/data/live-state.json?_t=' + Date.now()) : '';
    var localUrl = (global.location && global.location.protocol !== 'file:') ? ('./data/live-state.json?_t=' + Date.now()) : '';
    if (preferRawFirst && rawUrl) {
      urls.push(rawUrl);
      if (localUrl) urls.push(localUrl);
    } else {
      if (localUrl) urls.push(localUrl);
      if (rawUrl) urls.push(rawUrl);
    }
    if (urls.length === 0) return Promise.resolve({ updated: false });

    function tryUrl(idx) {
      if (idx >= urls.length) return Promise.resolve({ updated: false });
      return fetch(urls[idx], { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (remote) {
          if (!remote || !Array.isArray(remote.events)) throw new Error('无效JSON');
          var localTs = Date.parse((currentState && currentState.meta && currentState.meta.updatedAt) || '') || 0;
          var remoteTs = Date.parse((remote.meta && remote.meta.updatedAt) || '') || 0;
          if (force || remoteTs > localTs) {
            return { updated: true, state: remote };
          }
          if (idx + 1 < urls.length) {
            return tryUrl(idx + 1);
          }
          return { updated: false };
        })
        .catch(function () {
          return tryUrl(idx + 1);
        });
    }
    return tryUrl(0);
  }

  function isLocalSyncHost() {
    try {
      var host = (global.location && global.location.hostname) || '';
      var proto = (global.location && global.location.protocol) || '';
      return proto.indexOf('http') === 0 && (host === 'localhost' || host === '127.0.0.1');
    } catch (e) {
      return false;
    }
  }

  function pushStateToGitHub(repoOwnerRepo, githubToken, state) {
    var repo = String(repoOwnerRepo || DEFAULT_GITHUB_REPO).trim();
    var token = String(githubToken || getSavedGithubToken()).trim();

    if (isLocalSyncHost() && !token) {
      var localPayload = JSON.parse(JSON.stringify(state));
      localPayload.meta = localPayload.meta || {};
      localPayload.meta.updatedAt = new Date().toISOString();
      return fetch('./api/local-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localPayload)
      }).then(function (res) {
        if (!res.ok) {
          throw new Error('请确认已通过 启动运动会系统.bat (local_server.py) 启动本机免 Token 同步服务');
        }
        return res.json().then(function (data) {
          if (!data || !data.ok) throw new Error((data && data.error) || '本地免 Token 推送失败');
          return data;
        });
      });
    }

    if (!repo || !token) {
      return Promise.reject(new Error('请先配置 GitHub 仓库与 Personal Access Token'));
    }
    var apiUrl = 'https://api.github.com/repos/' + repo + '/contents/data/live-state.json';
    var headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    };

    var cleanState = JSON.parse(JSON.stringify(state));
    cleanState.meta = cleanState.meta || {};
    cleanState.meta.updatedAt = new Date().toISOString();
    var jsonStr = JSON.stringify(cleanState, null, 2);
    var b64Content = btoa(unescape(encodeURIComponent(jsonStr)));

    return fetch(apiUrl + '?ref=main&_t=' + Date.now(), { headers: headers })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; })
      .then(function (existing) {
        var body = {
          message: 'chore: 实时更新新民独立中学运动会成绩 (' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + ')',
          content: b64Content,
          branch: 'main'
        };
        if (existing && existing.sha) body.sha = existing.sha;
        return fetch(apiUrl, {
          method: 'PUT',
          headers: headers,
          body: JSON.stringify(body)
        });
      })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) { throw new Error('GitHub API ' + res.status + ': ' + t.slice(0, 120)); });
        }
        return res.json();
      });
  }

  function downloadStateJson(state) {
    var jsonStr = JSON.stringify(state, null, 2);
    var blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'live-state.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // 11. 纯前端 Web Audio 广播音效 & 中文语音播报
  // =========================================================================
  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () { });
    }
    return audioCtx;
  }

  function playTone(freq, startOffset, duration, type, volume) {
    var ctx = getAudioCtx();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
    gain.gain.setValueAtTime(0.001, ctx.currentTime + startOffset);
    gain.gain.exponentialRampToValueAtTime(volume || 0.14, ctx.currentTime + startOffset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + startOffset);
    osc.stop(ctx.currentTime + startOffset + duration + 0.02);
  }

  function playResultChime() {
    try {
      playTone(523.25, 0, 0.18, 'triangle', 0.12);
      playTone(659.25, 0.12, 0.22, 'triangle', 0.12);
      playTone(783.99, 0.24, 0.38, 'triangle', 0.14);
    } catch (e) { /* ignore */ }
  }

  function playRecordFanfare() {
    try {
      playTone(523.25, 0.0, 0.16, 'sawtooth', 0.12);
      playTone(659.25, 0.14, 0.16, 'sawtooth', 0.12);
      playTone(783.99, 0.28, 0.18, 'sawtooth', 0.14);
      playTone(1046.50, 0.44, 0.65, 'triangle', 0.18);
      playTone(783.99, 0.44, 0.65, 'triangle', 0.10);
    } catch (e) { /* ignore */ }
  }

  function speakAnnouncement(text) {
    if (!global.speechSynthesis || !text) return;
    try {
      global.speechSynthesis.cancel();
      var utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = 1.02;
      utter.pitch = 1.0;
      global.speechSynthesis.speak(utter);
    } catch (e) { /* ignore */ }
  }

  // =========================================================================
  // 12. 通用渲染助手（号码布 HTML、Toast、Animate.css 工具）
  // =========================================================================
  function renderBibHtml(bib, group, teamFallback) {
    var parsed = parseBib(bib);
    var grp = group || parsed.group;
    var divLabel = grp ? getDivisionLabel(grp) : '';
    var teamId = parsed.team || (teamFallback ? normalizeTeamId(teamFallback) : '');
    return '<span class="bib-badge bib-white" title="' + escapeHtml((divLabel ? divLabel + grp + ' · ' : '') + '号码布') + '">' +
      (teamId ? '<span class="bib-color-block team-dot-' + teamId + '"></span>' : '') +
      '<span class="bib-num-text">' + escapeHtml(bib || '----') + '</span>' +
      '</span>';
  }

  function renderTeamPillHtml(teamId) {
    var tid = normalizeTeamId(teamId);
    var t = TEAMS[tid];
    return '<span class="team-pill team-' + tid + '"><span class="bib-dot team-dot-' + tid + '"></span>' + escapeHtml(t.name) + '</span>';
  }

  // 本地学生名册与电视大屏肖像渲染（仅加载本机 gitignored 的 student-directory）
  function getLocalStudents() {
    return Array.isArray(global.SINMIN_LOCAL_STUDENTS) ? global.SINMIN_LOCAL_STUDENTS : [];
  }

  var STUDENT_NAME_ALIASES = {
    '曾微颖': '曾薇颖',
    '李芮禛': '李芮祯',
    '梁惠琪': '梁惠淇',
    '胡巧萱': '胡巧瑄',
    '方智恒': '方梓恒'
  };

  function findLocalStudent(nameOrId, className) {
    var q = String(nameOrId || '').trim();
    if (!q) return null;
    var qAlias = STUDENT_NAME_ALIASES[q] || q;
    var list = getLocalStudents();
    var cls = String(className || '').trim();
    var match = list.find(function (s) {
      return (s.name === q || s.name === qAlias || s.id === q) && (!cls || s.className === cls);
    });
    if (!match) {
      match = list.find(function (s) { return s.name === q || s.name === qAlias || s.id === q; });
    }
    return match || null;
  }

  function getStudentPhoto(entry) {
    if (!entry) return '';
    if (entry.photo) return entry.photo;
    var st = findLocalStudent(entry.name, entry.className);
    return (st && st.photo) ? st.photo : '';
  }

  function renderTvAvatarHtml(entry, ev, sizeClass, rank) {
    var size = sizeClass || 'md';
    var tid = normalizeTeamId(entry && entry.team);
    var t = TEAMS[tid];
    var rankCls = rank === 1 ? ' tv-avatar-rank-1' : (rank === 2 ? ' tv-avatar-rank-2' : (rank === 3 ? ' tv-avatar-rank-3' : ''));
    var isTeam = !!(ev && ev.isTeam);
    var nameStr = String((entry && entry.name) || '?').trim();
    var initial = nameStr ? nameStr.charAt(0) : '?';
    var photoUrl = isTeam ? '' : getStudentPhoto(entry);

    if (isTeam) {
      return (
        '<span class="tv-avatar-wrap tv-avatar-' + size + rankCls + '" style="border-color:' + t.color + '; background:#ffffff; padding:3px;">' +
          '<img src="./Sin Min Logo.png" alt="校徽" style="object-fit:contain;" />' +
        '</span>'
      );
    }

    var fallbackStyle = 'background:linear-gradient(135deg, ' + t.color + ', #0f172a);';
    if (photoUrl) {
      return (
        '<span class="tv-avatar-wrap tv-avatar-' + size + rankCls + '">' +
          '<img src="' + escapeHtml(photoUrl) + '" alt="' + escapeHtml(nameStr) + '" onerror="this.style.display=\'none\'; if(this.nextElementSibling) this.nextElementSibling.style.display=\'flex\';" />' +
          '<span class="tv-avatar-fallback" style="display:none; ' + fallbackStyle + '">' + escapeHtml(initial) + '</span>' +
        '</span>'
      );
    }

    return (
      '<span class="tv-avatar-wrap tv-avatar-' + size + rankCls + '">' +
        '<span class="tv-avatar-fallback" style="' + fallbackStyle + '">' + escapeHtml(initial) + '</span>' +
      '</span>'
    );
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function animateOnce(el, animClass) {
    if (!el) return;
    el.classList.remove('animate__animated', animClass);
    void el.offsetWidth;
    el.classList.add('animate__animated', animClass);
  }

  function showToast(msg, durationMs) {
    var stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    var item = document.createElement('div');
    item.className = 'toast-item animate__animated animate__fadeInRight animate__faster';
    item.textContent = msg;
    stack.appendChild(item);
    setTimeout(function () {
      item.classList.remove('animate__fadeInRight');
      item.classList.add('animate__fadeOutRight');
      setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 320);
    }, durationMs || 2800);
  }

  function getEventDayBucket(ev) {
    var sch = String((ev && ev.scheduleTime) || '');
    if (sch.indexOf('18/11') !== -1) return '18/11';
    if (sch.indexOf('02/12') !== -1) return '02/12';
    if (sch.indexOf('15/11') !== -1 || sch.indexOf('16/11') !== -1) return 'early';
    return '02/12';
  }

  function getDefaultActiveDay(nowDate) {
    var d = nowDate instanceof Date ? nowDate : new Date();
    var ymd = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    if (ymd <= 20261116) return 'early';
    if (ymd <= 20261130) return '18/11';
    return '02/12';
  }

  var REHEARSAL_NOTICE_DATA = {
    title: '体育处重要通告：色队开幕列队步操排练 & 接力赛放学练习',
    subtitle: '全体色队学生必须参与开幕列队进场步操活动 · 体育处安排第四、五、六节分场地排练',
    thursdaySummary: '星期四早上 8:10 静坐后进行运动会开幕总彩排，直到第四节结束（全体色队学生必须参与）',
    relaySummary: '凡有报名 4×100m、4×400m 接力赛的同学，请色队老师督促同学在 星期一、二、三 放学后 4:00pm 到草场进行练习',
    houses: [
      { id: 'red', name: '红队', mon: '思源池羽球场', tue: '礼堂', wed: '思源池' },
      { id: 'yellow', name: '黄队', mon: '礼堂', tue: '思源池羽球场', wed: '太阳能停车场' },
      { id: 'blue', name: '蓝队', mon: '太阳能停车场', tue: '餐饮室前的羽球场', wed: '礼堂' },
      { id: 'green', name: '青队', mon: '餐饮室前的羽球场', tue: '太阳能停车场', wed: '思源池的羽球场' }
    ]
  };

  function getActiveRehearsalWeekday(nowDate) {
    var d = nowDate instanceof Date ? nowDate : new Date();
    var dow = d.getDay(); // 1=Mon, 2=Tue, 3=Wed, 4=Thu
    if (dow === 1) return { key: 'mon', label: '星期一' };
    if (dow === 2) return { key: 'tue', label: '星期二' };
    if (dow === 3) return { key: 'wed', label: '星期三' };
    if (dow === 4) return { key: 'thu', label: '星期四' };
    return { key: 'mon', label: '星期一' };
  }

  function buildTickerText(state) {
    if (state.meta && state.meta.tickerOverride) {
      return state.meta.tickerOverride;
    }
    var items = [];
    var urgent = state.meta && state.meta.remoteTvCommand && state.meta.remoteTvCommand.urgentNotice;
    if (urgent && String(urgent).trim()) {
      items.push('📢 现场广播：' + String(urgent).trim());
    }
    var defaultDay = getDefaultActiveDay();
    if (defaultDay !== '02/12') {
      var activeWd = getActiveRehearsalWeekday();
      if (activeWd.key === 'thu') {
        items.push('📢 【体育处重要通告 · 今日开幕总彩排】' + REHEARSAL_NOTICE_DATA.thursdaySummary);
      } else {
        var todayMapStr = REHEARSAL_NOTICE_DATA.houses.map(function (h) {
          var icon = h.id === 'red' ? '🔴' : (h.id === 'yellow' ? '🟡' : (h.id === 'blue' ? '🔵' : '🟢'));
          return icon + h.name + '：' + h[activeWd.key];
        }).join(' ｜ ');
        items.push('📢 【体育处重要通告 · 开幕步操排练】全体色队学生必须参与开幕列队进场步操活动（第4、5、6节排练） 👉 【' + activeWd.label + '地点】' + todayMapStr);
      }
      items.push('📅 【第4–6节步操排练完整地点】星期一（红:思源池羽球场 / 黄:礼堂 / 蓝:太阳能停车场 / 青:餐饮室前的羽球场） ｜ 星期二（红:礼堂 / 黄:思源池羽球场 / 蓝:餐饮室前的羽球场 / 青:太阳能停车场） ｜ 星期三（红:思源池 / 黄:太阳能停车场 / 蓝:礼堂 / 青:思源池的羽球场） ｜ ⏰ ' + REHEARSAL_NOTICE_DATA.thursdaySummary);
      items.push('🏃 【接力赛放学练习】' + REHEARSAL_NOTICE_DATA.relaySummary);
    }
    var todayEvents = (state.events || []).filter(function (ev) { return getEventDayBucket(ev) === defaultDay; });
    if (todayEvents.length > 0 && defaultDay !== 'early') {
      var dayTitle = defaultDay === '18/11' ? '18/11 已完赛焦点赛事' : '02/12 运动会正日赛事';
      var summaryNames = todayEvents.slice(0, 7).map(function (ev) {
        return ev.group + ev.name + (ev.status === 'finished' ? '(已完赛)' : '');
      }).join('、');
      items.push('📅 ' + dayTitle + '（' + todayEvents.length + '项）：' + summaryNames);
    }
    var standings = computeStandings(state);
    if (standings.rankedTeams && standings.rankedTeams.length > 0) {
      var scoresLine = standings.rankedTeams.map(function (t) {
        return t.name + ' ' + t.points + '分';
      }).join(' ｜ ');
      items.push('🏆 实时总积分：' + scoresLine);
    }
    (state.events || []).forEach(function (ev) {
      if (ev.status !== 'finished' || !ev.finalEntries || ev.finalEntries.length === 0) return;
      var ranked = calculateEntries(ev.finalEntries, ev, true).filter(function (x) { return x.rank && x.rank <= 3; });
      if (ranked.length === 0) return;
      var podiumStr = ranked.map(function (r) {
        var medal = r.rank === 1 ? '🥇' : (r.rank === 2 ? '🥈' : '🥉');
        return medal + r.name + '(' + TEAMS[normalizeTeamId(r.team)].name + ' ' + formatMarkDisplay(r, ev) + (r.isRecord ? ' ★破纪录' : '') + ')';
      }).join('  ');
      items.push('📢 【' + ev.group + ' ' + ev.name + '】' + podiumStr);
    });
    if (items.length === 0) {
      return '欢迎莅临新民独立中学 2026 年度运动会现场！各项目实时成绩将同步播报。';
    }
    return items.join('     ✦     ');
  }

  function renderPublicLiveTicker(tickerEl, state) {
    if (!tickerEl) return;
    var trackEl = tickerEl.querySelector('.public-ticker-track');
    var toggleBtn = tickerEl.querySelector('.public-ticker-toggle');
    if (!trackEl) return;

    if (!tickerEl.dataset.bound) {
      tickerEl.dataset.bound = '1';
      tickerEl.addEventListener('click', function () {
        var paused = tickerEl.classList.toggle('is-paused');
        if (toggleBtn) {
          toggleBtn.textContent = paused ? '▶' : '⏸';
          toggleBtn.setAttribute('aria-label', paused ? '继续滚动' : '暂停滚动');
          toggleBtn.setAttribute('title', paused ? '点击继续滚动' : '点击暂停阅读');
        }
      });
    }

    var text = buildTickerText(state);
    if (trackEl.dataset.lastText === text) return;
    trackEl.dataset.lastText = text;

    trackEl.innerHTML =
      '<span class="public-ticker-copy">' + escapeHtml(text) + '</span>' +
      '<span class="public-ticker-copy" aria-hidden="true">' + escapeHtml(text) + '</span>';

    global.requestAnimationFrame(function () {
      var copyEl = trackEl.querySelector('.public-ticker-copy');
      var halfW = copyEl ? copyEl.offsetWidth : 1800;
      // 柔和慢速（约 26 px/s），方便师生在手机端从容阅读
      var sec = Math.max(45, Math.min(900, Math.round(halfW / 26)));
      trackEl.style.setProperty('--ticker-duration', sec + 's');
    });
  }

  function getDayBucketTabsMeta(state) {
    var counts = { all: 0, '18/11': 0, '02/12': 0, early: 0 };
    (state.events || []).forEach(function (ev) {
      counts.all += 1;
      var bucket = getEventDayBucket(ev);
      if (counts[bucket] !== undefined) counts[bucket] += 1;
    });
    var defDay = getDefaultActiveDay();
    return {
      defaultDay: defDay,
      counts: counts,
      map: {
        '18/11': { key: '18/11', label: (defDay === '18/11' ? '📅 18/11 今日比赛' : '📅 18/11 赛事') + ' (' + counts['18/11'] + ')' },
        '02/12': { key: '02/12', label: (defDay === '02/12' ? '🔥 02/12 今日正日' : '🔥 02/12 运动会正日') + ' (' + counts['02/12'] + ')' },
        early: { key: 'early', label: '✓ 15-16/11 前期赛果 (' + counts.early + ')' },
        all: { key: 'all', label: '📋 全部项目 (' + counts.all + ')' }
      }
    };
  }

  function renderDayTabButtons(containerEl, activeDay, state, orderKeys) {
    if (!containerEl) return;
    var meta = getDayBucketTabsMeta(state);
    var keys = orderKeys || ['18/11', '02/12', 'early', 'all'];
    containerEl.innerHTML = keys.map(function (k) {
      var info = meta.map[k];
      if (!info) return '';
      return '<button type="button" class="chip-btn ' + (activeDay === info.key ? 'active' : '') + '" data-val="' + info.key + '">' + escapeHtml(info.label) + '</button>';
    }).join('');
  }

  function renderDailyCardsStrip(stripEl, subtitleEl, state, selectedDay) {
    if (!stripEl) return;
    var defaultDay = getDefaultActiveDay();
    var focusDay = (!selectedDay || selectedDay === 'all') ? defaultDay : selectedDay;
    var list = (state.events || []).filter(function (ev) {
      return getEventDayBucket(ev) === focusDay;
    });

    var dayNames = {
      '18/11': '18/11 赛程',
      '02/12': '02/12 运动会正日',
      early: '15-16/11 前期赛果'
    };
    if (subtitleEl) {
      if (selectedDay === 'all') {
        subtitleEl.textContent = '下方显示全部 ' + (state.events || []).length + ' 项 · 上方聚焦 ' + (dayNames[focusDay] || focusDay) + '（' + list.length + ' 项，点击卡片直达）';
      } else {
        subtitleEl.textContent = (dayNames[focusDay] || focusDay) + ' 共 ' + list.length + ' 项 · 点击卡片直达下方完整成绩';
      }
    }

    if (list.length === 0) {
      stripEl.innerHTML = '<div style="padding:14px; color:var(--text-secondary); font-size:0.84rem;">该赛期暂无比赛项目</div>';
      return;
    }

    stripEl.innerHTML = list.map(function (ev) {
      var divLabel = getDivisionLabel(ev.group);
      var tagStyle = divLabel === '高中'
        ? 'background:rgba(56,189,248,0.18); color:#7dd3fc;'
        : (divLabel === '全校公开' ? 'background:rgba(168,85,247,0.2); color:#d8b4fe;' : 'background:rgba(16,185,129,0.18); color:#34d399;');
      var grpText = ev.group === '公开' ? '全校公开' : (divLabel + ' · ' + ev.group);
      var statusPill = ev.status === 'finished'
        ? '<span style="color:#34d399; font-weight:700; font-size:0.74rem;">✓ 已完赛</span>'
        : (ev.status === 'prelims_done'
          ? '<span style="color:#fbbf24; font-weight:700; font-size:0.74rem;">⏳ 预赛已出炉</span>'
          : '<span style="color:#7dd3fc; font-weight:700; font-size:0.74rem;">🕒 待赛</span>');

      var bodyHtml = '';
      if (ev.status === 'finished' && ev.finalEntries && ev.finalEntries.length > 0) {
        var top3 = calculateEntries(ev.finalEntries, ev, true).filter(function (x) { return x.rank && x.rank <= 3; }).slice(0, 3);
        if (top3.length > 0) {
          bodyHtml = '<div class="daily-card-podium">' + top3.map(function (r) {
            var medal = r.rank === 1 ? '🥇' : (r.rank === 2 ? '🥈' : '🥉');
            var tid = normalizeTeamId(r.team);
            return '<div class="daily-podium-line">' +
              '<span style="display:inline-flex; align-items:center; gap:4px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
                '<span>' + medal + '</span>' +
                '<span class="bib-dot team-dot-' + tid + '" style="width:7px; height:7px;"></span>' +
                '<strong>' + escapeHtml(r.name) + '</strong>' +
              '</span>' +
              '<span style="font-family:var(--font-mono); color:#e2e8f0; flex-shrink:0;">' + escapeHtml(formatMarkDisplay(r, ev)) + '</span>' +
            '</div>';
          }).join('') + '</div>';
        }
      }
      if (!bodyHtml) {
        var fCount = (ev.finalEntries || []).length;
        var pCount = (ev.prelimEntries || []).length;
        var sampleList = fCount > 0 ? ev.finalEntries : (ev.prelimEntries || []);
        var sampleNames = sampleList.slice(0, 3).map(function (e) { return escapeHtml(e.name); }).join('、');
        var countLabel = fCount > 0
          ? ('决赛名单 ' + fCount + ' ' + (ev.isTeam ? '队' : '人'))
          : (pCount > 0 ? ('预赛名单 ' + pCount + ' 人') : '待检录排道次');
        bodyHtml =
          '<div class="daily-card-preview">' +
            '<div style="color:#cbd5e1; font-weight:600;">' + countLabel + '</div>' +
            (sampleNames ? '<div class="daily-card-names">' + sampleNames + (sampleList.length > 3 ? ' 等' : '') + '</div>' : '') +
          '</div>';
      }

      return (
        '<button type="button" class="daily-event-card' + (ev.status === 'finished' ? ' is-finished' : '') + '" data-jump-ev="' + escapeHtml(ev.id) + '">' +
          '<div>' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:6px;">' +
              '<span class="skew-tag" style="' + tagStyle + ' padding:2px 7px; font-size:0.72rem;"><span>' + escapeHtml(grpText) + '</span></span>' +
              statusPill +
            '</div>' +
            '<div style="font-weight:800; font-size:0.98rem; color:#f8fafc; line-height:1.25;">' + escapeHtml(ev.name) + '</div>' +
            (ev.scheduleTime ? '<div style="font-size:0.72rem; color:var(--text-secondary); margin-top:3px;">🕒 ' + escapeHtml(ev.scheduleTime) + '</div>' : '') +
          '</div>' +
          bodyHtml +
          '<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; color:var(--accent-cyan); padding-top:4px; border-top:1px solid rgba(148,163,184,0.12);">' +
            '<span>查看完整成绩 ↓</span>' +
            ((ev.eventPhoto && ev.showPhotoPublic !== false) ? '<span style="color:#fbbf24;">📸 含实拍图</span>' : '') +
          '</div>' +
        '</button>'
      );
    }).join('');
  }

  function syncChipGroupActive(containerEl, val) {
    if (!containerEl) return;
    containerEl.querySelectorAll('.chip-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-val') === val);
    });
  }

  function renderRehearsalNoticePanel(panelEl) {
    if (!panelEl) return;
    var defaultDay = getDefaultActiveDay();
    if (defaultDay === '02/12') {
      panelEl.style.display = 'none';
      return;
    }
    panelEl.style.display = '';
    if (panelEl.dataset.rendered === '1') return;
    panelEl.dataset.rendered = '1';

    var activeWd = getActiveRehearsalWeekday();
    var daysMeta = [
      { key: 'mon', label: '星期一', period: '第 4、5、6 节' },
      { key: 'tue', label: '星期二', period: '第 4、5、6 节' },
      { key: 'wed', label: '星期三', period: '第 4、5、6 节' }
    ];

    var houseCardsHtml = REHEARSAL_NOTICE_DATA.houses.map(function (h) {
      var t = TEAMS[h.id];
      var rowsHtml = daysMeta.map(function (dm) {
        var isToday = activeWd.key === dm.key;
        return (
          '<div class="rehearsal-day-row' + (isToday ? ' is-today' : '') + '">' +
            '<span class="rehearsal-day-label">' +
              escapeHtml(dm.label) +
              (isToday ? '<span class="rehearsal-today-pill">今日</span>' : '') +
            '</span>' +
            '<strong class="rehearsal-venue-text">' + escapeHtml(h[dm.key]) + '</strong>' +
          '</div>'
        );
      }).join('');

      return (
        '<div class="rehearsal-house-card" style="background:' + t.soft + '; border-color:' + t.color + '55;">' +
          '<div class="rehearsal-house-head">' +
            renderTeamPillHtml(h.id) +
            '<span class="rehearsal-period-tag">第 4–6 节排练</span>' +
          '</div>' +
          '<div class="rehearsal-days-list">' + rowsHtml + '</div>' +
        '</div>'
      );
    }).join('');

    var isThu = activeWd.key === 'thu';
    panelEl.innerHTML =
      '<div class="rehearsal-notice-head">' +
        '<div>' +
          '<div class="rehearsal-badge-row">' +
            '<span class="rehearsal-urgent-tag">📢 体育处重要通告</span>' +
            '<span class="rehearsal-sub-tag">最佳精神奖 · 开幕步操占 20%</span>' +
          '</div>' +
          '<h2 class="section-title" style="margin-top:4px;">' +
            '<span>🚩</span>' +
            '<span>色队开幕列队步操排练 & 接力赛练习地点分配</span>' +
          '</h2>' +
          '<div class="rehearsal-notice-desc">' + escapeHtml(REHEARSAL_NOTICE_DATA.subtitle) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm rehearsal-collapse-btn" id="btn-toggle-rehearsal">收起 ▲</button>' +
      '</div>' +
      '<div class="rehearsal-notice-body" id="rehearsal-notice-body">' +
        '<div class="rehearsal-house-grid">' + houseCardsHtml + '</div>' +
        '<div class="rehearsal-extra-banners">' +
          '<div class="rehearsal-extra-item is-thursday' + (isThu ? ' is-today' : '') + '">' +
            '<span class="rehearsal-extra-icon">⏰</span>' +
            '<div>' +
              '<strong>星期四开幕总彩排：</strong>' +
              '<span>早上 <strong>8:10</strong> 静坐后进行运动会开幕彩排，直到<strong>第四节结束</strong>（全体色队学生必须参与）。</span>' +
            '</div>' +
          '</div>' +
          '<div class="rehearsal-extra-item is-relay">' +
            '<span class="rehearsal-extra-icon">🏃</span>' +
            '<div>' +
              '<strong>4×100m、4×400m 接力赛放学练习：</strong>' +
              '<span>凡有报名接力赛的同学，请色队老师督促同学在 <strong>星期一、二、三 放学后 4:00pm</strong> 到 <strong>草场</strong> 进行练习。</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var toggleBtn = panelEl.querySelector('#btn-toggle-rehearsal');
    var bodyEl = panelEl.querySelector('#rehearsal-notice-body');
    if (toggleBtn && bodyEl) {
      toggleBtn.addEventListener('click', function () {
        var collapsed = panelEl.classList.toggle('is-collapsed');
        bodyEl.style.display = collapsed ? 'none' : '';
        toggleBtn.textContent = collapsed ? '展开地点表 ▼' : '收起 ▲';
      });
    }
  }

  function renderPublicTopWidgets(state, filters) {
    renderPublicLiveTicker(document.getElementById('public-live-ticker'), state);
    renderRehearsalNoticePanel(document.getElementById('rehearsal-notice-section'));
    renderDayTabButtons(document.getElementById('daily-day-tabs'), filters.day, state, ['18/11', '02/12', 'early', 'all']);
    renderDayTabButtons(document.getElementById('filter-day'), filters.day, state, ['all', '18/11', '02/12', 'early']);
    renderDailyCardsStrip(
      document.getElementById('daily-cards-strip'),
      document.getElementById('daily-spotlight-subtitle'),
      state,
      filters.day
    );
  }

  function bindPublicDayAndJump(getState, filters, onFilterRefresh) {
    function setDay(dayVal) {
      filters.day = dayVal;
      renderPublicTopWidgets(getState(), filters);
      onFilterRefresh();
    }

    ['daily-day-tabs', 'filter-day'].forEach(function (id) {
      var wrap = document.getElementById(id);
      if (!wrap) return;
      wrap.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-val]');
        if (!btn) return;
        setDay(btn.getAttribute('data-val'));
      });
    });

    var stripEl = document.getElementById('daily-cards-strip');
    if (stripEl) {
      stripEl.addEventListener('click', function (e) {
        var cardBtn = e.target.closest('[data-jump-ev]');
        if (!cardBtn) return;
        var evId = cardBtn.getAttribute('data-jump-ev');
        var st = getState();
        var ev = (st.events || []).find(function (x) { return x.id === evId; });
        if (!ev) return;

        var changed = false;
        if (filters.day && filters.day !== 'all' && getEventDayBucket(ev) !== filters.day) {
          filters.day = getEventDayBucket(ev);
          changed = true;
        }
        if (filters.group !== 'all') {
          var matchGrp = (filters.group === 'senior' && (ev.group === '男甲' || ev.group === '女甲')) ||
            (filters.group === 'junior' && (ev.group === '男乙' || ev.group === '女乙')) ||
            (ev.group === filters.group);
          if (!matchGrp) {
            filters.group = 'all';
            syncChipGroupActive(document.getElementById('filter-group'), 'all');
            changed = true;
          }
        }
        if (filters.type !== 'all') {
          var matchType = (filters.type === 'team' && ev.isTeam) ||
            (filters.type === 'track' && ev.type === 'track' && !ev.isTeam) ||
            (filters.type === 'field' && ev.type === 'field');
          if (!matchType) {
            filters.type = 'all';
            syncChipGroupActive(document.getElementById('filter-type'), 'all');
            changed = true;
          }
        }
        if (filters.team !== 'all') {
          var allEntries = (ev.finalEntries || []).concat(ev.prelimEntries || []);
          var hasTeam = allEntries.some(function (en) { return normalizeTeamId(en.team) === filters.team; });
          if (!hasTeam) {
            filters.team = 'all';
            syncChipGroupActive(document.getElementById('filter-team'), 'all');
            changed = true;
          }
        }
        if (filters.query && filters.query.trim()) {
          filters.query = '';
          var si = document.getElementById('search-input');
          var cb = document.getElementById('btn-clear-search');
          if (si) si.value = '';
          if (cb) cb.style.display = 'none';
          changed = true;
        }

        if (changed) {
          renderPublicTopWidgets(st, filters);
          onFilterRefresh();
        }

        var targetCard = document.getElementById('event-card-' + evId);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetCard.classList.add('is-jump-highlight');
          animateOnce(targetCard, 'animate__pulse');
          setTimeout(function () {
            targetCard.classList.remove('is-jump-highlight');
          }, 2200);
        }
      });
    }

    var feedEl = document.getElementById('events-feed');
    if (feedEl) {
      feedEl.addEventListener('click', function (e) {
        var showAllBtn = e.target.closest('#btn-show-all-days');
        if (showAllBtn) {
          setDay('all');
        }
      });
    }
  }

  var HANDBOOK_INFO = {
    schoolName: '亚罗士打新民独立中学',
    meetTitle: '2026年校内运动会',
    meetDate: '2026年12月2日（星期三）',
    workProcess: [
      { no: 1, date: '01/11/2026', desc: '色队大集合（选顾问、队长、工委、选手）' },
      { no: 2, date: '10/11/2026', desc: '红队、黄队运动员选拔' },
      { no: 3, date: '12/11/2026', desc: '各项目报名截止' },
      { no: 4, date: '15/11/2026', desc: '各项目半决赛及决赛（铅球男乙/男甲、跳高女乙/女甲、60m/400m半决赛）' },
      { no: 5, date: '16/11/2026', desc: '各项目半决赛及决赛（铅球女乙/女甲、1500m决赛、200m半决赛）' },
      { no: 6, date: '18/11–30/11/2026', desc: '400m 决赛、男甲/男乙跳高、女甲标枪公开赛及余下预/决赛' },
      { no: 7, date: '02/12/2026（星期三）', desc: '运动会正日（开幕典礼 8:30am · 田径决赛与闭幕颁奖）' }
    ],
    openingCeremony: [
      '08:30am 国旗、校旗及各队运动员入场',
      '唱国歌 · 唱校歌',
      '董事长黄明国致辞 · 校友会主席准拿督陈荣发致辞 · 校长马慈真致辞',
      '运动员代表宣誓 · 运动员离场'
    ],
    daySchedule: [
      { session: '1', time: '09:00am', event: '女乙 200m', round: '决赛' },
      { session: '2', time: '09:10am', event: '女甲 200m', round: '决赛' },
      { session: '3', time: '09:20am', event: '男乙 200m', round: '决赛' },
      { session: '4', time: '09:30am', event: '男甲 200m', round: '决赛' },
      { session: '5', time: '09:40am', event: '女乙 800m', round: '决赛' },
      { session: '6', time: '09:55am', event: '女甲 800m', round: '决赛' },
      { session: '7', time: '10:10am', event: '男乙 800m', round: '决赛' },
      { session: '8', time: '10:25am', event: '男甲 800m', round: '决赛' },
      { session: '9', time: '10:40am', event: '男甲 标枪（700g公开）', round: '决赛' },
      { session: '10', time: '11:20am', event: '女乙 4×100m 接力', round: '决赛' },
      { session: '11', time: '11:35am', event: '女甲 4×100m 接力', round: '决赛' },
      { session: '12', time: '11:50am', event: '男乙 4×100m 接力', round: '决赛' },
      { session: '13', time: '12:05pm', event: '男甲 4×100m 接力', round: '决赛' },
      { session: '-', time: '12:20pm–1:30pm', event: '午休时段', round: '休息' },
      { session: '14', time: '01:30pm', event: '女乙 60m', round: '决赛' },
      { session: '15', time: '01:35pm', event: '女甲 60m', round: '决赛' },
      { session: '16', time: '01:40pm', event: '男乙 60m', round: '决赛' },
      { session: '17', time: '01:45pm', event: '男甲 60m', round: '决赛' },
      { session: '18', time: '01:50pm', event: '大队拔河（季、殿军）', round: '决赛' },
      { session: '19', time: '02:00pm', event: '大队拔河（冠、亚军）', round: '决赛' },
      { session: '20', time: '02:10pm', event: '女乙 4×400m 接力', round: '决赛' },
      { session: '21', time: '02:20pm', event: '女甲 4×400m 接力', round: '决赛' },
      { session: '22', time: '02:30pm', event: '男乙 4×400m 接力', round: '决赛' },
      { session: '23', time: '02:40pm', event: '男甲 4×400m 接力', round: '决赛' },
      { session: '24', time: '02:50pm', event: '大队接力 8×200m（4男4女）', round: '决赛' },
      { session: '25', time: '03:00pm', event: '颁奖与闭幕典礼', round: '仪式' }
    ],
    houses: [
      { id: 'red', name: '红队', gathering: '太阳能停车场', leaders: '吴立阳、洪雅芝', captains: '罗弘富、陈慧文', teachers: '梁怀蔚、洪雅芝、吴立阳、Noorismah、Haslinda、李志展、尤宝忠、施玮量' },
      { id: 'yellow', name: '黄队', gathering: '羽球场', leaders: '张碧涵、刘荠祥、陈依琳', captains: '邱嘉旭、张紫微', teachers: '张展瑜、吴允芬、陈依琳、张碧涵、黄馨香、刘荠祥、王智昭、Christina' },
      { id: 'blue', name: '蓝队', gathering: '篮球场', leaders: '李欣霓、王盈盈', captains: '林靖翔、黄宇洁', teachers: '林德政、王盈盈、Bala、李欣霓、陈奕桦、李芷馨、张凯旋' },
      { id: 'green', name: '青队', gathering: '宿舍前台阶', leaders: '杨汉顺、王韵麒', captains: '朱俊亿、蔡子仪', teachers: '李佩珊、王韵麒、杜丽玲、张津门、杨汉顺、吴淑仪、张燕欣' }
    ],
    highJumpHeights: [
      { group: '男甲', heights: '1.30m; 1.35m; 1.40m; 1.45m; 1.50m; 1.54m; 1.58m; 1.62m; 1.65m; 1.68m 以此类推' },
      { group: '男乙', heights: '1.20m; 1.25m; 1.30m; 1.35m; 1.40m; 1.45m; 1.49m; 1.53m; 1.57m; 1.60m 以此类推' },
      { group: '女甲', heights: '1.05m; 1.08m; 1.11m; 1.13m; 1.15m; 1.17m; 1.19m; 1.21m; 1.23m; 1.25m 以此类推' },
      { group: '女乙', heights: '1.00m; 1.05m; 1.08m; 1.10m; 1.12m; 1.14m; 1.16m; 1.18m; 1.20m; 1.22m 以此类推' }
    ],
    throwWeights: '铅球：女乙/女甲 3kg、男乙 4kg、男甲 5kg ｜ 标枪：女子公开 500g、男子公开 700g',
    officials: [
      { role: '大会主席 / 裁判长', name: '马慈真校长' },
      { role: '工委会主席 / 竞赛 / 终点', name: '陈奇男' },
      { role: '副主席 / 器材 / 发令员 / 三铁', name: '曾成利' },
      { role: '检录组', name: '梁怀蔚（组长）、李佩珊（兼文书/颁奖）' },
      { role: '检查组 / 场地', name: 'Bala（组长）、施玮量' },
      { role: '跳跃组 / 计圈组 / 计时组', name: '吴淑仪（跳高）、张展瑜（计圈）、李志展/Noorismah/Haslinda/杜丽玲（计时）' },
      { role: '总成绩组', name: '尤宝忠' }
    ]
  };

  function renderFieldDetailsHtml(entry, ev) {
    if (!ev || ev.type !== 'field' || !entry) return '';
    var parts = [];
    var isHj = ev.name && ev.name.indexOf('跳高') !== -1;
    if (!isHj) {
      var attempts = [entry.attempt1, entry.attempt2, entry.attempt3, entry.attempt4, entry.attempt5, entry.attempt6]
        .filter(function (x) { return x !== undefined && x !== ''; });
      if (attempts.length > 0) {
        parts.push('试掷: ' + escapeHtml(attempts.join(' / ')));
      }
    }
    if (entry.note) {
      parts.push((isHj ? '跃高: ' : '备注: ') + escapeHtml(entry.note));
    }
    if (parts.length === 0) return '';
    return '<div style="font-size:0.72rem; color:var(--text-secondary); line-height:1.45;">' + parts.join('<br/>') + '</div>';
  }

  function compressImageFile(file, maxWidth, quality) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('未选择图片文件'));
        return;
      }
      var maxW = maxWidth || 1100;
      var q = quality || 0.78;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.width || maxW;
            var h = img.height || maxW;
            if (w > maxW) {
              h = Math.round(h * (maxW / w));
              w = maxW;
            }
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', q));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = function () { reject(new Error('无法解析该图片文件')); };
        img.src = ev.target.result;
      };
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.readAsDataURL(file);
    });
  }

  function renderEventPhotoHtml(ev) {
    if (!ev || !ev.eventPhoto || ev.showPhotoPublic === false) return '';
    return (
      '<details style="margin-top:10px; padding:10px 12px; border-radius:10px; background:rgba(15,23,42,0.55); border:1px solid rgba(56,189,248,0.25);">' +
        '<summary style="cursor:pointer; font-size:0.82rem; font-weight:700; color:#7dd3fc;">📸 查看本项目现场实拍 / 官方成绩单照片（点击展开或收起）</summary>' +
        '<div style="margin-top:10px; text-align:center;">' +
          '<img src="' + ev.eventPhoto + '" alt="' + escapeHtml((ev.group || '') + ' ' + (ev.name || '') + ' 成绩单图片') + '" style="max-width:100%; max-height:480px; border-radius:8px; border:1px solid rgba(148,163,184,0.3); object-fit:contain;" />' +
        '</div>' +
      '</details>'
    );
  }

  function renderHandbookHtml() {
    var h = HANDBOOK_INFO;
    var scheduleRows = h.daySchedule.map(function (row) {
      var isHighlight = row.round === '休息' || row.round === '仪式';
      return (
        '<tr style="' + (isHighlight ? 'background:rgba(56,189,248,0.08);' : '') + '">' +
          '<td style="font-family:var(--font-mono);">' + escapeHtml(row.session) + '</td>' +
          '<td style="font-family:var(--font-mono); white-space:nowrap;">' + escapeHtml(row.time) + '</td>' +
          '<td><strong>' + escapeHtml(row.event) + '</strong></td>' +
          '<td>' + escapeHtml(row.round) + '</td>' +
        '</tr>'
      );
    }).join('');

    var houseCards = h.houses.map(function (item) {
      var t = TEAMS[item.id];
      return (
        '<div style="padding:12px; border-radius:12px; background:' + t.soft + '; border:1px solid ' + t.color + '44;">' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;">' +
            '<strong>' + renderTeamPillHtml(item.id) + '</strong>' +
            '<span style="font-size:0.78rem; color:#fde047; font-weight:700;">📍 集合：' + escapeHtml(item.gathering) + '</span>' +
          '</div>' +
          '<div style="font-size:0.78rem; color:var(--text-secondary); line-height:1.55;">' +
            '<div>召集人：' + escapeHtml(item.leaders) + '</div>' +
            '<div>队长：' + escapeHtml(item.captains) + '</div>' +
            '<div>负责老师：' + escapeHtml(item.teachers) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var workHtml = h.workProcess.map(function (w) {
      return '<li><strong>' + escapeHtml(w.date) + '</strong> — ' + escapeHtml(w.desc) + '</li>';
    }).join('');

    var hjHtml = h.highJumpHeights.map(function (row) {
      return '<div><strong>' + escapeHtml(row.group) + '：</strong>' + escapeHtml(row.heights) + '</div>';
    }).join('');

    var officialsHtml = h.officials.map(function (o) {
      return '<div><strong>' + escapeHtml(o.role) + '：</strong>' + escapeHtml(o.name) + '</div>';
    }).join('');

    return (
      '<div style="display:flex; flex-direction:column; gap:18px;">' +
        '<div style="padding:12px 14px; border-radius:12px; background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.28); font-size:0.82rem; line-height:1.6;">' +
          '<div style="font-weight:800; color:#7dd3fc; margin-bottom:4px;">📅 筹备与赛事日程总览</div>' +
          '<ul style="margin:0; padding-left:18px;">' + workHtml + '</ul>' +
        '</div>' +
        '<div>' +
          '<h4 style="margin:0 0 8px; font-size:0.95rem;">🏁 正日赛程表（' + escapeHtml(h.meetDate) + ' · 08:30am 开幕礼后接续比赛）</h4>' +
          '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>场次</th><th>时间</th><th>组别与项目</th><th>阶段</th></tr></thead><tbody>' + scheduleRows + '</tbody></table></div>' +
        '</div>' +
        '<div>' +
          '<h4 style="margin:0 0 8px; font-size:0.95rem;">🚩 四色队伍大集合地点与负责人</h4>' +
          '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px;">' + houseCards + '</div>' +
        '</div>' +
        '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; font-size:0.8rem; color:var(--text-secondary); line-height:1.6;">' +
          '<div style="padding:12px; border-radius:12px; background:rgba(15,23,42,0.65); border:1px solid rgba(148,163,184,0.16);">' +
            '<div style="font-weight:800; color:#f8fafc; margin-bottom:6px;">📏 跳高起跳高度与投掷器材标准</div>' +
            hjHtml +
            '<div style="margin-top:6px; color:#fcd34d;">' + escapeHtml(h.throwWeights) + '</div>' +
          '</div>' +
          '<div style="padding:12px; border-radius:12px; background:rgba(15,23,42,0.65); border:1px solid rgba(148,163,184,0.16);">' +
            '<div style="font-weight:800; color:#f8fafc; margin-bottom:6px;">⚖️ 大会裁判与工委名单（摘要）</div>' +
            officialsHtml +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function initBgMusicPlayer(options) {
    if (typeof document === 'undefined') return null;
    var existing = document.getElementById('bgm-floating-bar');
    if (existing) return existing;

    var opts = options || {};
    var vol = typeof opts.defaultVolume === 'number' ? opts.defaultVolume : 0.30;
    var tracks = [
      { title: '《新民少年・勇往直前》④', src: encodeURI('./MP3/《新民少年・勇往直前》 4.mp3') + '?v=20261123v1' },
      { title: '《新民少年・勇往直前》⑤', src: encodeURI('./MP3/《新民少年・勇往直前》 5.mp3') + '?v=20261123v1' },
      { title: '《新民少年・勇往直前》⑥', src: encodeURI('./MP3/《新民少年・勇往直前》 6.mp3') + '?v=20261123v1' },
      { title: '《新民少年・勇往直前》⑦', src: encodeURI('./MP3/《新民少年・勇往直前》 7.mp3') + '?v=20261123v1' }
    ];

    var trackIdx = 0;
    var userPaused = false;
    var waitingUnlock = false;
    var errorStreak = 0;
    var gainWired = false;
    var gainNodeRef = null;

    var audio = document.createElement('audio');
    audio.id = 'sinmin-bgm-audio';
    audio.preload = 'auto';
    audio.src = tracks[trackIdx].src;
    try {
      audio.volume = vol;
    } catch (e) { /* ignore iOS readonly volume */ }
    audio.style.display = 'none';
    document.body.appendChild(audio);

    var bar = document.createElement('div');
    bar.id = 'bgm-floating-bar';
    bar.className = 'bgm-floating-bar no-print';
    bar.innerHTML =
      '<button type="button" class="bgm-pill-btn" id="btn-bgm-toggle" title="点击开启或暂停背景主题曲">🎵 主题曲加载中</button>' +
      '<button type="button" class="bgm-next-btn" id="btn-bgm-next" title="切换下一首《新民少年・勇往直前》">⇄ 1/' + tracks.length + '</button>';
    document.body.appendChild(bar);

    var toggleBtn = document.getElementById('btn-bgm-toggle');
    var nextBtn = document.getElementById('btn-bgm-next');

    function updateUi() {
      var trackTitle = tracks[trackIdx].title;
      nextBtn.textContent = '⇄ ' + (trackIdx + 1) + '/' + tracks.length;
      nextBtn.setAttribute('title', '当前：' + trackTitle + '（点击切歌）');
      if (!audio.paused) {
        toggleBtn.textContent = '🎵 主题曲: 播放中';
        bar.classList.add('is-playing');
        bar.classList.remove('is-waiting');
      } else if (userPaused) {
        toggleBtn.textContent = '🔇 主题曲: 静音';
        bar.classList.remove('is-playing', 'is-waiting');
      } else if (waitingUnlock) {
        toggleBtn.textContent = '🎵 轻触播放主题曲';
        bar.classList.add('is-waiting');
        bar.classList.remove('is-playing');
      } else {
        toggleBtn.textContent = '🎵 主题曲: 准备中';
        bar.classList.remove('is-playing', 'is-waiting');
      }
    }

    var gestureEvents = ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'];
    function removeUnlockListeners() {
      gestureEvents.forEach(function (evName) {
        document.removeEventListener(evName, onFirstGesture, true);
      });
    }
    function addUnlockListeners() {
      gestureEvents.forEach(function (evName) {
        document.addEventListener(evName, onFirstGesture, true);
      });
    }
    function onFirstGesture(e) {
      if (userPaused) {
        removeUnlockListeners();
        return;
      }
      if (e && e.target && e.target.closest && e.target.closest('#bgm-floating-bar')) {
        return;
      }
      tryPlay(false);
    }

    function ensureSoftVolume() {
      try {
        audio.volume = vol;
      } catch (e) { /* ignore iOS readonly volume */ }
      if (gainWired) {
        try {
          getAudioCtx();
          if (gainNodeRef) gainNodeRef.gain.value = vol;
        } catch (err) { /* ignore if Web Audio unavailable */ }
        return;
      }
      if (Math.abs((typeof audio.volume === 'number' ? audio.volume : 1) - vol) > 0.02) {
        try {
          var ctx = getAudioCtx();
          if (ctx && typeof ctx.createMediaElementSource === 'function') {
            var srcNode = ctx.createMediaElementSource(audio);
            var gainNode = ctx.createGain();
            gainNode.gain.value = vol;
            srcNode.connect(gainNode);
            gainNode.connect(ctx.destination);
            gainNodeRef = gainNode;
            gainWired = true;
          }
        } catch (err) { /* ignore if Web Audio unavailable */ }
      }
    }

    function tryPlay(isUserClick) {
      ensureSoftVolume();
      try {
        var playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.then(function () {
            waitingUnlock = false;
            errorStreak = 0;
            removeUnlockListeners();
            updateUi();
          }).catch(function (err) {
            if (err && err.name === 'AbortError') return;
            if (!userPaused) {
              waitingUnlock = true;
              addUnlockListeners();
            }
            if (isUserClick && err && err.name === 'NotAllowedError') {
              showToast('请再轻触一次以播放背景主题曲');
            }
            updateUi();
          });
        } else {
          waitingUnlock = false;
          removeUnlockListeners();
          updateUi();
        }
      } catch (err) {
        if (!userPaused) {
          waitingUnlock = true;
          addUnlockListeners();
        }
        updateUi();
      }
    }

    function playTrack(idx, notify) {
      trackIdx = (idx + tracks.length) % tracks.length;
      audio.src = tracks[trackIdx].src;
      userPaused = false;
      updateUi();
      tryPlay(notify);
      if (notify) showToast('🎵 正在播放：' + tracks[trackIdx].title);
    }

    audio.addEventListener('ended', function () {
      if (!userPaused) {
        playTrack(trackIdx + 1, false);
      }
    });
    audio.addEventListener('error', function () {
      errorStreak += 1;
      if (!userPaused && errorStreak < tracks.length) {
        playTrack(trackIdx + 1, false);
      } else {
        waitingUnlock = false;
        updateUi();
      }
    });
    audio.addEventListener('loadedmetadata', ensureSoftVolume);
    audio.addEventListener('canplay', ensureSoftVolume);
    audio.addEventListener('play', function () { ensureSoftVolume(); updateUi(); });
    audio.addEventListener('playing', function () { ensureSoftVolume(); updateUi(); });
    audio.addEventListener('pause', updateUi);

    bar.addEventListener('click', function (e) { e.stopPropagation(); });
    toggleBtn.addEventListener('click', function () {
      if (!audio.paused) {
        userPaused = true;
        waitingUnlock = false;
        removeUnlockListeners();
        audio.pause();
        updateUi();
      } else {
        userPaused = false;
        tryPlay(true);
      }
    });
    nextBtn.addEventListener('click', function () {
      errorStreak = 0;
      playTrack(trackIdx + 1, true);
    });

    updateUi();
    tryPlay(false);
    return { audio: audio, bar: bar, tracks: tracks };
  }

  global.SinMinSports = {
    TEAMS: TEAMS,
    TEAM_ORDER: TEAM_ORDER,
    GROUPS: GROUPS,
    GROUP_ORDER: GROUP_ORDER,
    HANDBOOK_INFO: HANDBOOK_INFO,
    renderFieldDetailsHtml: renderFieldDetailsHtml,
    compressImageFile: compressImageFile,
    renderEventPhotoHtml: renderEventPhotoHtml,
    renderHandbookHtml: renderHandbookHtml,
    TV_MODES: TV_MODES,
    LANES_4: LANES_4,
    LANES_60M: LANES_60M,
    parseBib: parseBib,
    getGroupBibColor: getGroupBibColor,
    getDivisionLabel: getDivisionLabel,
    normalizeTeamId: normalizeTeamId,
    parseTrackTimeToSeconds: parseTrackTimeToSeconds,
    parseFieldMark: parseFieldMark,
    formatTrackSeconds: formatTrackSeconds,
    formatMarkDisplay: formatMarkDisplay,
    calculateEntries: calculateEntries,
    computePrelimQualifiers: computePrelimQualifiers,
    getDnsDisqualifications: getDnsDisqualifications,
    computeStandings: computeStandings,
    createDefaultState: createDefaultState,
    createDefaultTvCommand: createDefaultTvCommand,
    loadState: loadState,
    saveState: saveState,
    loadTvCommand: loadTvCommand,
    pushTvCommand: pushTvCommand,
    subscribeSync: subscribeSync,
    downloadTemplateExcel: downloadTemplateExcel,
    importExcelFile: importExcelFile,
    importWorkbookArrayBuffer: importWorkbookArrayBuffer,
    exportArchiveExcel: exportArchiveExcel,
    fetchFromGoogleSheetsCsv: fetchFromGoogleSheetsCsv,
    pushToGoogleAppsScript: pushToGoogleAppsScript,
    DEFAULT_GITHUB_REPO: DEFAULT_GITHUB_REPO,
    isLocalSyncHost: isLocalSyncHost,
    getSavedGithubToken: getSavedGithubToken,
    saveGithubToken: saveGithubToken,
    fetchFromRemoteStateJson: fetchFromRemoteStateJson,
    pushStateToGitHub: pushStateToGitHub,
    downloadStateJson: downloadStateJson,
    playResultChime: playResultChime,
    playRecordFanfare: playRecordFanfare,
    speakAnnouncement: speakAnnouncement,
    renderBibHtml: renderBibHtml,
    renderTeamPillHtml: renderTeamPillHtml,
    getLocalStudents: getLocalStudents,
    findLocalStudent: findLocalStudent,
    getStudentPhoto: getStudentPhoto,
    renderTvAvatarHtml: renderTvAvatarHtml,
    escapeHtml: escapeHtml,
    animateOnce: animateOnce,
    showToast: showToast,
    getEventDayBucket: getEventDayBucket,
    getDefaultActiveDay: getDefaultActiveDay,
    buildTickerText: buildTickerText,
    renderPublicLiveTicker: renderPublicLiveTicker,
    renderDayTabButtons: renderDayTabButtons,
    renderDailyCardsStrip: renderDailyCardsStrip,
    renderPublicTopWidgets: renderPublicTopWidgets,
    bindPublicDayAndJump: bindPublicDayAndJump,
    initBgMusicPlayer: initBgMusicPlayer
  };
})(window);
