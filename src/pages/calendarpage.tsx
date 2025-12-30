import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Spin, Tooltip, Tag, Segmented, Timeline, App } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Solar } from 'lunar-javascript';
import { getMovies, addMovie, autoMatchMovie } from '../services/api';
import { Movie } from '../types';
import TmdbSearchModal from '../components/tmdbsearchmodal';
import LocalImage from '../components/localimage';
import { useNavigate } from 'react-router-dom';
import { CalendarOutlined, BarsOutlined } from '@ant-design/icons';

const CalendarPage: React.FC = () => {
  const { message } = App.useApp();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'timeline'>('calendar');
  const navigate = useNavigate();

  const loadMovies = async () => {
    setLoading(true);
    try {
      const data = await getMovies();
      setMovies(data);
    } catch (error) {
      console.error(error);
      message.error('加载影视数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovies();
  }, []);

  const getListData = (value: Dayjs) => {
    const dateStr = value.format('YYYY-MM-DD');
    return movies.filter(movie => {
        return movie.viewing_date === dateStr;
    });
  };

  const timelineItems = useMemo(() => {
      // Group movies by viewing_date
      const grouped: Record<string, Movie[]> = {};
      movies.forEach(m => {
          if (m.viewing_date) {
              if (!grouped[m.viewing_date]) {
                  grouped[m.viewing_date] = [];
              }
              grouped[m.viewing_date].push(m);
          }
      });

      // Sort dates descending (newest first)
      const dates = Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

      return dates.map(date => ({
          children: (
              <div style={{ paddingBottom: 24 }}>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 18, fontWeight: 'bold', marginRight: 8 }}>{date}</span>
                    <span style={{ fontSize: 14, color: '#888' }}>{dayjs(date).format('dddd')}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                      {grouped[date].map(movie => (
                          <div 
                            key={movie.id} 
                            style={{ width: 110, cursor: 'pointer' }}
                            onClick={() => navigate(`/details/${movie.id}`)}
                          >
                              <div style={{ 
                                width: '100%', 
                                aspectRatio: '2/3', 
                                borderRadius: 8, 
                                overflow: 'hidden', 
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                marginBottom: 8,
                                position: 'relative'
                              }}>
                                  <LocalImage 
                                    src={movie.poster_path} 
                                    alt={movie.title} 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                  />
                                  {movie.vote_average && (
                                    <div style={{ 
                                        position: 'absolute', 
                                        top: 4, 
                                        right: 4, 
                                        backgroundColor: 'rgba(0,0,0,0.7)', 
                                        color: '#fadb14', 
                                        fontSize: 10, 
                                        padding: '1px 4px', 
                                        borderRadius: 4 
                                    }}>
                                        {movie.vote_average}
                                    </div>
                                  )}
                              </div>
                              <div style={{ fontSize: 13, textAlign: 'center', lineHeight: '1.4' }}>
                                  <Tooltip title={movie.title}>
                                    <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ant-color-text)' }}>{movie.title}</div>
                                  </Tooltip>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          ),
          color: dayjs(date).isSame(dayjs(), 'day') ? 'blue' : 'gray'
      }));
  }, [movies]);

  const dateCellRender = (value: Dayjs) => {
    const listData = getListData(value);

    // Lunar/Holiday Logic
    const solar = Solar.fromYmd(value.year(), value.month() + 1, value.date());
    const lunar = solar.getLunar();
    
    let text = '';
    let color = '#999';
    let isFestival = false;

    const festivals = lunar.getFestivals();
    const solarFestivals = solar.getFestivals();
    const jieQi = lunar.getJieQi();
    
    // Priority: Lunar Festival > Solar Festival > JieQi > Lunar Day
    if (festivals.length > 0) {
        text = festivals[0];
        color = '#ff4d4f'; // Red for festivals
        isFestival = true;
    } else if (solarFestivals.length > 0) {
        text = solarFestivals[0];
        color = '#ff4d4f';
        isFestival = true;
    } else if (jieQi) {
        text = jieQi;
        color = '#faad14'; // Orange for JieQi
    } else {
        text = lunar.getDayInChinese();
        if (text === '初一') {
            text = lunar.getMonthInChinese() + '月';
            color = '#1890ff'; // Blue for first day of month
        }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
            fontSize: 12, 
            color: color, 
            marginBottom: 4,
            fontWeight: isFestival ? 'bold' : 'normal'
        }}>
            {text}
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {listData.map((item) => (
            <li key={item.id} style={{ marginBottom: 4 }}>
               <Tooltip title={item.title}>
                  <Tag 
                      color="blue" 
                      style={{ 
                          maxWidth: '100%', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          margin: 0
                      }}
                      onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/details/${item.id}`);
                      }}
                  >
                      {item.title}
                  </Tag>
               </Tooltip>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const onSelect = (newValue: Dayjs, info: { source: 'year' | 'month' | 'date' | 'customize' }) => {
      if (info.source === 'date') {
        setSelectedDate(newValue);
        setIsAddModalVisible(true);
      }
  };

  const handleAddMovie = async (item: any) => {
    try {
      let newMovie: any;
      
      if (item.id === 0) { // Pre-formatted or Douban
          newMovie = { ...item };
      } else { // TMDB Raw
          newMovie = {
            tmdb_id: item.id,
            title: item.title || item.name || '未知标题',
            original_title: item.original_title || item.original_name,
            overview: item.overview,
            poster_path: item.poster_path ? (item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/w500${item.poster_path}`) : undefined,
            release_date: item.release_date || item.first_air_date,
            vote_average: item.vote_average,
            add_time: new Date().toISOString().split('T')[0],
            id: 0,
          };
      }

      // Set viewing_date for calendar display
      newMovie.viewing_date = selectedDate.format('YYYY-MM-DD');

      const addedMovie = await addMovie(newMovie);
      message.success('已添加，正在后台匹配素材...');
      setIsAddModalVisible(false);
      loadMovies();

      // Trigger auto-match in background
      if (addedMovie && addedMovie.id) {
        autoMatchMovie(addedMovie.id).then(() => {
            console.log('Auto match completed for', addedMovie.title);
        }).catch(e => console.error('Auto match failed:', e));
      }
    } catch (error) {
      console.error(error);
      message.error(typeof error === 'string' ? error : '添加失败');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as 'calendar' | 'timeline')}
            options={[
                { label: '日历视图', value: 'calendar', icon: <CalendarOutlined /> },
                { label: '时间线视图', value: 'timeline', icon: <BarsOutlined /> }
            ]}
          />
      </div>
      
      <Spin spinning={loading}>
        {viewMode === 'calendar' ? (
            <Calendar 
                cellRender={dateCellRender} 
                onSelect={onSelect} 
            />
        ) : (
            <div style={{ marginTop: 20, padding: '0 20px' }}>
                <Timeline
                    items={timelineItems}
                />
                {timelineItems.length === 0 && <div style={{ textAlign: 'center', color: '#999' }}>暂无观影记录</div>}
            </div>
        )}
      </Spin>

      <TmdbSearchModal 
        visible={isAddModalVisible} 
        onCancel={() => setIsAddModalVisible(false)}
        onAdd={handleAddMovie}
        // We could pass the selected date to pre-fill search year if we wanted
        // initialYear={selectedDate.format('YYYY')} 
      />
    </div>
  );
};

export default CalendarPage;
