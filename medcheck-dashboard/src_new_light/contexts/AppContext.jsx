import { createContext, useContext, useReducer } from 'react';

// 초기 상태
const initialState = {
  // 사용자 정보 (권한 관리)
  user: {
    role: 'customer', // 'customer' | 'admin'
    name: '테스트 사용자',
    hospital: '테스트 병원',
  },
  
  // 현재 탭
  activeTab: 'dashboard',
  
  // 분석 결과 저장 (탭 이동해도 유지!)
  analysisResults: {
    single: null,      // 단일 URL 분석 결과
    batch: [],         // 배치 분석 결과
    history: [],       // 분석 히스토리
  },
  
  // 선택된 위반 (하이라이트 뷰어용)
  selectedViolation: null,
  
  // 로딩 상태
  loading: {
    analysis: false,
    batch: false,
  },
  
  // API 설정
  apiUrl: 'https://medcheck-engine.mmakid.workers.dev',
};

// 액션 타입
const ActionTypes = {
  SET_TAB: 'SET_TAB',
  SET_USER: 'SET_USER',
  SET_SINGLE_RESULT: 'SET_SINGLE_RESULT',
  ADD_BATCH_RESULT: 'ADD_BATCH_RESULT',
  SET_BATCH_RESULTS: 'SET_BATCH_RESULTS',
  CLEAR_BATCH_RESULTS: 'CLEAR_BATCH_RESULTS',
  ADD_TO_HISTORY: 'ADD_TO_HISTORY',
  SET_SELECTED_VIOLATION: 'SET_SELECTED_VIOLATION',
  SET_LOADING: 'SET_LOADING',
  TOGGLE_ROLE: 'TOGGLE_ROLE',
};

// 리듀서
function appReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_TAB:
      return { ...state, activeTab: action.payload };
    
    case ActionTypes.SET_USER:
      return { ...state, user: { ...state.user, ...action.payload } };
    
    case ActionTypes.SET_SINGLE_RESULT:
      return {
        ...state,
        analysisResults: {
          ...state.analysisResults,
          single: action.payload,
        },
      };
    
    case ActionTypes.ADD_BATCH_RESULT:
      return {
        ...state,
        analysisResults: {
          ...state.analysisResults,
          batch: [...state.analysisResults.batch, action.payload],
        },
      };
    
    case ActionTypes.SET_BATCH_RESULTS:
      return {
        ...state,
        analysisResults: {
          ...state.analysisResults,
          batch: action.payload,
        },
      };
    
    case ActionTypes.CLEAR_BATCH_RESULTS:
      return {
        ...state,
        analysisResults: {
          ...state.analysisResults,
          batch: [],
        },
      };
    
    case ActionTypes.ADD_TO_HISTORY:
      return {
        ...state,
        analysisResults: {
          ...state.analysisResults,
          history: [action.payload, ...state.analysisResults.history].slice(0, 50),
        },
      };
    
    case ActionTypes.SET_SELECTED_VIOLATION:
      return { ...state, selectedViolation: action.payload };
    
    case ActionTypes.SET_LOADING:
      return {
        ...state,
        loading: { ...state.loading, ...action.payload },
      };
    
    case ActionTypes.TOGGLE_ROLE:
      return {
        ...state,
        user: {
          ...state.user,
          role: state.user.role === 'customer' ? 'admin' : 'customer',
        },
      };
    
    default:
      return state;
  }
}

// Context 생성
const AppContext = createContext(null);

// Provider 컴포넌트
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  // 액션 함수들
  const actions = {
    setTab: (tab) => dispatch({ type: ActionTypes.SET_TAB, payload: tab }),
    setUser: (user) => dispatch({ type: ActionTypes.SET_USER, payload: user }),
    setSingleResult: (result) => dispatch({ type: ActionTypes.SET_SINGLE_RESULT, payload: result }),
    addBatchResult: (result) => dispatch({ type: ActionTypes.ADD_BATCH_RESULT, payload: result }),
    setBatchResults: (results) => dispatch({ type: ActionTypes.SET_BATCH_RESULTS, payload: results }),
    clearBatchResults: () => dispatch({ type: ActionTypes.CLEAR_BATCH_RESULTS }),
    addToHistory: (item) => dispatch({ type: ActionTypes.ADD_TO_HISTORY, payload: item }),
    setSelectedViolation: (v) => dispatch({ type: ActionTypes.SET_SELECTED_VIOLATION, payload: v }),
    setLoading: (loading) => dispatch({ type: ActionTypes.SET_LOADING, payload: loading }),
    toggleRole: () => dispatch({ type: ActionTypes.TOGGLE_ROLE }),
  };
  
  return (
    <AppContext.Provider value={{ state, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// 커스텀 훅
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

export default AppContext;
