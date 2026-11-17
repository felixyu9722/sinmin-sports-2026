/* ==========================================================================
   新民独立中学 (Sin Min Middle School) 2026 运动会核心规则引擎与跨屏数据总线
   兼容 file:// 双击运行与静态服务器部署 (挂载于 window.SinMinSports)
   ========================================================================== */
(function (global) {
  'use strict';

  var STORAGE_STATE_KEY = 'sinmin_sports_2026_state_v2';
  var STORAGE_TV_KEY = 'sinmin_sports_2026_tv_v1';
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
    '女乙': { code: '5', label: '女乙', division: '初中', fullName: '女子乙组 (初中)', bibColor: 'white', bibLabel: '白布' }
  };

  function getDivisionLabel(group) {
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
    var groupMap = { '1': '男甲', '2': '男乙', '4': '女甲', '5': '女乙' };

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
    if (!s || /^(DNS|DNF|DQ|NM|X|-)$/i.test(s)) return null;
    // 支持 2:14.50 或 2'14"50
    var cleaned = s.replace(/[′']/g, ':').replace(/[″"]/g, '.').replace(/s$/i, '').trim();
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
    if (!s || /^(DNS|DNF|DQ|NM|X|-|FOUL)$/i.test(s)) return null;
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
    var raw = [entry.attempt1, entry.attempt2, entry.attempt3];
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
      meta: {
        title: '新民独立中学 2026 年度运动会',
        subtitle: 'SIN MIN MIDDLE SCHOOL ANNUAL SPORTS MEET 2026',
        updatedAt: '2026-11-17T05:00:00.000Z',
        githubRepo: DEFAULT_GITHUB_REPO,
        googleSheetCsvUrl: '',
        googleAppsScriptUrl: '',
        tickerOverride: ''
      },
      spiritScores: { red: 88, yellow: 92, blue: 90, green: 89 },
      events: [
        {
          id: 'ev_100m_sb',
          order: 1,
          name: '100米',
          group: '男甲',
          type: 'track',
          isTeam: false,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 1,
          teamMedalRule: 'individual',
          recordMark: '11.35',
          recordHolder: '陈伟杰 (2023)',
          scheduleTime: '09:00',
          status: 'finished',
          prelimEntries: [
            { heat: 1, lane: 2, bib: '1101', name: '林师宏', className: '高一文商', team: 'red', result: '11.42', status: 'OK' },
            { heat: 1, lane: 3, bib: '3104', name: '李宗泽', className: '高二文商', team: 'blue', result: '11.68', status: 'OK' },
            { heat: 1, lane: 4, bib: '2107', name: '邹捷贺', className: '高三烘培', team: 'yellow', result: '11.95', status: 'OK' },
            { heat: 1, lane: 1, bib: '4105', name: '蔡靖栐', className: '高一文商', team: 'green', result: '12.20', status: 'OK' },
            { heat: 2, lane: 2, bib: '2102', name: '马有友', className: '高三文商', team: 'yellow', result: '11.38', status: 'OK' },
            { heat: 2, lane: 3, bib: '4108', name: '朱俊亿', className: '高三文商', team: 'green', result: '11.60', status: 'OK' },
            { heat: 2, lane: 4, bib: '1109', name: '王奕诚', className: '高二文商', team: 'red', result: '12.05', status: 'OK' },
            { heat: 2, lane: 1, bib: '3112', name: '刘俊宏', className: '高二餐饮', team: 'blue', result: '12.14', status: 'OK' }
          ],
          finalEntries: [
            { lane: 3, bib: '2102', name: '马有友', className: '高三文商', team: 'yellow', prelimMark: '11.38s', qualBadge: 'Q', result: '11.18', status: 'OK' },
            { lane: 2, bib: '1101', name: '林师宏', className: '高一文商', team: 'red', prelimMark: '11.42s', qualBadge: 'Q', result: '11.39', status: 'OK' },
            { lane: 1, bib: '4108', name: '朱俊亿', className: '高三文商', team: 'green', prelimMark: '11.60s', qualBadge: 'q', result: '11.58', status: 'OK' },
            { lane: 4, bib: '3104', name: '李宗泽', className: '高二文商', team: 'blue', prelimMark: '11.68s', qualBadge: 'q', result: '11.74', status: 'OK' }
          ]
        },
        {
          id: 'ev_lj_sg',
          order: 2,
          name: '跳远',
          group: '女甲',
          type: 'field',
          isTeam: false,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 1,
          teamMedalRule: 'individual',
          recordMark: '5.12',
          recordHolder: '许静宜 (2022)',
          scheduleTime: '09:30',
          status: 'finished',
          prelimEntries: [],
          finalEntries: [
            { lane: 1, bib: '1402', name: '洪宜君', className: '高三文商', team: 'red', attempt1: '5.04', attempt2: '5.21', attempt3: '5.15', result: '5.21', status: 'OK' },
            { lane: 2, bib: '3406', name: '李舒庈', className: '高二文商', team: 'blue', attempt1: '4.88', attempt2: '4.92', attempt3: '4.75', result: '4.92', status: 'OK' },
            { lane: 3, bib: '2403', name: '胡巧微', className: '高三烘培', team: 'yellow', attempt1: '4.92', attempt2: 'X', attempt3: '4.81', result: '4.92', status: 'OK' },
            { lane: 4, bib: '4401', name: '杨迦淇', className: '高二餐饮', team: 'green', attempt1: '4.60', attempt2: '4.70', attempt3: '4.66', result: '4.70', status: 'OK' },
            { lane: 5, bib: '1410', name: '吴家润', className: '高一文商', team: 'red', attempt1: '4.45', attempt2: '4.52', attempt3: '4.49', result: '4.52', status: 'OK' }
          ]
        },
        {
          id: 'ev_200m_sb',
          order: 3,
          name: '200米',
          group: '男甲',
          type: 'track',
          isTeam: false,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 1,
          teamMedalRule: 'individual',
          recordMark: '22.90',
          recordHolder: '陈伟杰 (2023)',
          scheduleTime: '10:00',
          status: 'finished',
          prelimEntries: [],
          finalEntries: [
            { lane: 3, bib: '2102', name: '马有友', className: '高三文商', team: 'yellow', prelimMark: '23.15s', qualBadge: 'Q', result: '22.98', status: 'OK' },
            { lane: 2, bib: '1101', name: '林师宏', className: '高一文商', team: 'red', prelimMark: '23.28s', qualBadge: 'Q', result: '23.20', status: 'OK' },
            { lane: 1, bib: '4108', name: '朱俊亿', className: '高三文商', team: 'green', prelimMark: '23.54s', qualBadge: 'q', result: '23.55', status: 'OK' },
            { lane: 4, bib: '3104', name: '李宗泽', className: '高二文商', team: 'blue', prelimMark: '23.70s', qualBadge: 'q', result: '23.82', status: 'OK' }
          ]
        },
        {
          id: 'ev_60m_jb',
          order: 4,
          name: '60米',
          group: '男乙',
          type: 'track',
          isTeam: false,
          is60m: true,
          windCheck: false,
          wind: '',
          physicalMedalCount: 1,
          teamMedalRule: 'individual',
          recordMark: '7.45',
          recordHolder: '罗家俊 (2024)',
          scheduleTime: '10:25',
          status: 'finished',
          prelimEntries: [
            { heat: 1, lane: 2, bib: '3201', name: '张嘉杰', className: '初三忠', team: 'blue', result: '7.55', status: 'OK' },
            { heat: 1, lane: 3, bib: '1203', name: '林子恒', className: '初二孝', team: 'red', result: '7.62', status: 'OK' },
            { heat: 1, lane: 4, bib: '2205', name: '葛子乐', className: '初三孝', team: 'yellow', result: '7.79', status: 'OK' },
            { heat: 1, lane: 5, bib: '4204', name: '许俊超', className: '初一孝', team: 'green', result: '7.98', status: 'OK' },
            { heat: 2, lane: 2, bib: '4202', name: '刘家泓', className: '初三孝', team: 'green', result: '7.50', status: 'OK' },
            { heat: 2, lane: 3, bib: '1207', name: '廖文杰', className: '初三忠', team: 'red', result: '7.70', status: 'OK' },
            { heat: 2, lane: 4, bib: '2209', name: '黄宣晸', className: '初二孝', team: 'yellow', result: '7.85', status: 'OK' },
            { heat: 2, lane: 5, bib: '3211', name: '封胜阳', className: '初一孝', team: 'blue', result: '8.04', status: 'OK' }
          ],
          finalEntries: [
            { lane: 4, bib: '4202', name: '刘家泓', className: '初三孝', team: 'green', prelimMark: '7.50s', qualBadge: 'Q', result: '7.41', status: 'OK' },
            { lane: 3, bib: '3201', name: '张嘉杰', className: '初三忠', team: 'blue', prelimMark: '7.55s', qualBadge: 'Q', result: '7.53', status: 'OK' },
            { lane: 2, bib: '1203', name: '林子恒', className: '初二孝', team: 'red', prelimMark: '7.62s', qualBadge: 'q', result: '7.60', status: 'OK' },
            { lane: 5, bib: '1207', name: '廖文杰', className: '初三忠', team: 'red', prelimMark: '7.70s', qualBadge: 'q', result: '7.60', status: 'OK' },
            { lane: 1, bib: '2205', name: '葛子乐', className: '初三孝', team: 'yellow', prelimMark: '7.79s', qualBadge: 'q', result: '7.75', status: 'OK' },
            { lane: 6, bib: '2209', name: '黄宣晸', className: '初二孝', team: 'yellow', prelimMark: '7.85s', qualBadge: 'q', result: '7.89', status: 'OK' }
          ]
        },
        {
          id: 'ev_100m_jg',
          order: 5,
          name: '100米',
          group: '女乙',
          type: 'track',
          isTeam: false,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 1,
          teamMedalRule: 'individual',
          recordMark: '13.20',
          recordHolder: '梁可欣 (2021)',
          scheduleTime: '10:45',
          status: 'prelims_done',
          prelimEntries: [
            { heat: 1, lane: 1, bib: '1501', name: '陈宣彤', className: '初三孝', team: 'red', result: '13.45', status: 'OK' },
            { heat: 1, lane: 2, bib: '2504', name: '苏倩瑶', className: '初二孝', team: 'yellow', result: '13.62', status: 'OK' },
            { heat: 1, lane: 3, bib: '3503', name: '张妤轩', className: '初三忠', team: 'blue', result: '13.90', status: 'OK' },
            { heat: 1, lane: 4, bib: '4506', name: '冯佳喜', className: '初二孝', team: 'green', result: '14.18', status: 'OK' },
            { heat: 2, lane: 1, bib: '3502', name: '林珂伊', className: '初三忠', team: 'blue', result: '13.38', status: 'OK' },
            { heat: 2, lane: 2, bib: '4501', name: '林芷宇', className: '初三孝', team: 'green', result: '13.55', status: 'OK' },
            { heat: 2, lane: 3, bib: '1508', name: '蔡碧恬', className: '初二忠', team: 'red', result: '13.85', status: 'OK' },
            { heat: 2, lane: 4, bib: '2509', name: '娜丽莎', className: '初一孝', team: 'yellow', result: 'DNS', status: 'DNS' }
          ],
          finalEntries: []
        },
        {
          id: 'ev_hj_jb',
          order: 6,
          name: '跳高',
          group: '男乙',
          type: 'field',
          isTeam: false,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 1,
          teamMedalRule: 'individual',
          recordMark: '1.72',
          recordHolder: '洪子阳 (2024)',
          scheduleTime: '11:05',
          status: 'finished',
          prelimEntries: [],
          finalEntries: [
            { lane: 1, bib: '4202', name: '刘家泓', className: '初三孝', team: 'green', attempt1: '1.60', attempt2: '1.65', attempt3: '1.68', result: '1.68', status: 'OK' },
            { lane: 2, bib: '1203', name: '林子恒', className: '初二孝', team: 'red', attempt1: '1.58', attempt2: '1.62', attempt3: 'X', result: '1.62', status: 'OK' },
            { lane: 3, bib: '3206', name: '周鼎森', className: '初二忠', team: 'blue', attempt1: '1.55', attempt2: '1.60', attempt3: 'X', result: '1.60', status: 'OK' },
            { lane: 4, bib: '2205', name: '葛子乐', className: '初三孝', team: 'yellow', attempt1: '1.50', attempt2: '1.55', attempt3: 'X', result: '1.55', status: 'OK' }
          ]
        },
        {
          id: 'ev_sp_sg',
          order: 7,
          name: '铅球',
          group: '女甲',
          type: 'field',
          isTeam: false,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 1,
          teamMedalRule: 'individual',
          recordMark: '9.85',
          recordHolder: '沈慧婷 (2023)',
          scheduleTime: '11:25',
          status: 'finished',
          prelimEntries: [],
          finalEntries: [
            { lane: 1, bib: '1402', name: '洪宜君', className: '高三文商', team: 'red', attempt1: '9.35', attempt2: '9.68', attempt3: '9.50', result: '9.68', status: 'OK' },
            { lane: 2, bib: '4405', name: '许柔恩', className: '高三文商', team: 'green', attempt1: '8.90', attempt2: '9.12', attempt3: '9.05', result: '9.12', status: 'OK' },
            { lane: 3, bib: '2408', name: '邱天心', className: '高二餐饮', team: 'yellow', attempt1: '8.75', attempt2: '8.80', attempt3: '8.60', result: '8.80', status: 'OK' },
            { lane: 4, bib: '3409', name: '陈慧文', className: '高一文商', team: 'blue', attempt1: '8.20', attempt2: '8.44', attempt3: '8.31', result: '8.44', status: 'OK' }
          ]
        },
        {
          id: 'ev_800m_jg',
          order: 8,
          name: '800米',
          group: '女乙',
          type: 'track',
          isTeam: false,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 1,
          teamMedalRule: 'individual',
          recordMark: '2:34.50',
          recordHolder: '邓婉婷 (2022)',
          scheduleTime: '11:45',
          status: 'startlist',
          prelimEntries: [],
          finalEntries: [
            { lane: 1, bib: '3502', name: '林珂伊', className: '初三忠', team: 'blue', prelimMark: '-', qualBadge: '', result: '', status: 'OK' },
            { lane: 2, bib: '1501', name: '陈宣彤', className: '初三孝', team: 'red', prelimMark: '-', qualBadge: '', result: '', status: 'OK' },
            { lane: 3, bib: '2509', name: '娜丽莎', className: '初一孝', team: 'yellow', prelimMark: '-', qualBadge: '', result: '', status: 'OK' },
            { lane: 4, bib: '4501', name: '林芷宇', className: '初三孝', team: 'green', prelimMark: '-', qualBadge: '', result: '', status: 'OK' }
          ]
        },
        {
          id: 'ev_4x100_sb',
          order: 9,
          name: '4×100米接力',
          group: '男甲',
          type: 'relay',
          isTeam: true,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 5,
          teamMedalRule: 'relay',
          recordMark: '44.80',
          recordHolder: '蓝队男甲 (2023)',
          scheduleTime: '14:15',
          status: 'finished',
          prelimEntries: [],
          finalEntries: [
            { lane: 3, bib: '1100', name: '红队男甲接力队', className: '高中代表队', team: 'red', result: '44.62', status: 'OK' },
            { lane: 2, bib: '3100', name: '蓝队男甲接力队', className: '高中代表队', team: 'blue', result: '45.10', status: 'OK' },
            { lane: 1, bib: '2100', name: '黄队男甲接力队', className: '高中代表队', team: 'yellow', result: '45.48', status: 'OK' },
            { lane: 4, bib: '4100', name: '青队男甲接力队', className: '高中代表队', team: 'green', result: '46.15', status: 'OK' }
          ]
        },
        {
          id: 'ev_tug_sg',
          order: 10,
          name: '拔河赛',
          group: '女甲',
          type: 'tug',
          isTeam: true,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 8,
          teamMedalRule: 'tug_or_grand',
          recordMark: '',
          recordHolder: '',
          scheduleTime: '15:00',
          status: 'finished',
          prelimEntries: [],
          finalEntries: [
            { lane: 1, bib: '3400', name: '蓝队女甲拔河队', className: '8人主力阵容', team: 'blue', result: '1', status: 'OK' },
            { lane: 2, bib: '2400', name: '黄队女甲拔河队', className: '8人主力阵容', team: 'yellow', result: '2', status: 'OK' },
            { lane: 3, bib: '1400', name: '红队女甲拔河队', className: '8人主力阵容', team: 'red', result: '3', status: 'OK' },
            { lane: 4, bib: '4400', name: '青队女甲拔河队', className: '8人主力阵容', team: 'green', result: '4', status: 'OK' }
          ]
        },
        {
          id: 'ev_grand_relay',
          order: 11,
          name: '大队接力',
          group: '男甲',
          type: 'relay',
          isTeam: true,
          is60m: false,
          windCheck: false,
          wind: '',
          physicalMedalCount: 8,
          teamMedalRule: 'tug_or_grand',
          recordMark: '3:32.00',
          recordHolder: '黄队 (2024)',
          scheduleTime: '16:10',
          status: 'startlist',
          prelimEntries: [],
          finalEntries: [
            { lane: 1, bib: '1199', name: '红队大队接力', className: '全队8棒联队', team: 'red', result: '', status: 'OK' },
            { lane: 2, bib: '2199', name: '黄队大队接力', className: '全队8棒联队', team: 'yellow', result: '', status: 'OK' },
            { lane: 3, bib: '3199', name: '蓝队大队接力', className: '全队8棒联队', team: 'blue', result: '', status: 'OK' },
            { lane: 4, bib: '4199', name: '青队大队接力', className: '全队8棒联队', team: 'green', result: '', status: 'OK' }
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
    saveState(def, false);
    return def;
  }

  function saveState(state, shouldBroadcast) {
    state.meta = state.meta || {};
    state.meta.updatedAt = new Date().toISOString();
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

  function importExcelFile(file, currentState) {
    return new Promise(function (resolve, reject) {
      try {
        var XLSX = ensureXLSX();
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var data = new Uint8Array(e.target.result);
            var wb = XLSX.read(data, { type: 'array' });
            var firstSheet = wb.SheetNames[0];
            var rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { defval: '' });
            if (!rows || rows.length === 0) {
              reject(new Error('表格内容为空，请检查第一张工作表。'));
              return;
            }
            var merged = mergeImportedRows(rows, currentState);
            resolve(merged);
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

  function fetchFromRemoteStateJson(repoOwnerRepo, currentState, force) {
    var repo = String(repoOwnerRepo || (currentState && currentState.meta && currentState.meta.githubRepo) || DEFAULT_GITHUB_REPO).trim();
    var urls = [];
    if (global.location && global.location.protocol !== 'file:') {
      urls.push('./data/live-state.json?_t=' + Date.now());
    }
    if (repo) {
      urls.push('https://raw.githubusercontent.com/' + repo + '/main/data/live-state.json?_t=' + Date.now());
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
          return { updated: false };
        })
        .catch(function () {
          return tryUrl(idx + 1);
        });
    }
    return tryUrl(0);
  }

  function pushStateToGitHub(repoOwnerRepo, githubToken, state) {
    var repo = String(repoOwnerRepo || DEFAULT_GITHUB_REPO).trim();
    var token = String(githubToken || getSavedGithubToken()).trim();
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

  function findLocalStudent(nameOrId, className) {
    var q = String(nameOrId || '').trim();
    if (!q) return null;
    var list = getLocalStudents();
    var cls = String(className || '').trim();
    var match = list.find(function (s) {
      return (s.name === q || s.id === q) && (!cls || s.className === cls);
    });
    if (!match) {
      match = list.find(function (s) { return s.name === q || s.id === q; });
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

  function buildTickerText(state) {
    if (state.meta && state.meta.tickerOverride) {
      return state.meta.tickerOverride;
    }
    var items = [];
    var standings = computeStandings(state);
    var leader = standings.rankedTeams[0];
    if (leader) {
      items.push('🏆 全场总积分领先：' + leader.name + ' (' + leader.points + '分 · ' + leader.gold + '金' + leader.silver + '银' + leader.bronze + '铜)');
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

  global.SinMinSports = {
    TEAMS: TEAMS,
    TEAM_ORDER: TEAM_ORDER,
    GROUPS: GROUPS,
    GROUP_ORDER: GROUP_ORDER,
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
    exportArchiveExcel: exportArchiveExcel,
    fetchFromGoogleSheetsCsv: fetchFromGoogleSheetsCsv,
    pushToGoogleAppsScript: pushToGoogleAppsScript,
    DEFAULT_GITHUB_REPO: DEFAULT_GITHUB_REPO,
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
    buildTickerText: buildTickerText
  };
})(window);
