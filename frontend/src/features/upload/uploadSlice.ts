import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UploadState {
  jobId: string | null;
  numPages: number;
  fileName: string | null;
}

const initialState: UploadState = {
  jobId: null,
  numPages: 0,
  fileName: null,
};

const uploadSlice = createSlice({
  name: 'upload',
  initialState,
  reducers: {
    setUploadResult(
      state,
      action: PayloadAction<{ jobId: string; numPages: number; fileName: string }>,
    ) {
      state.jobId = action.payload.jobId;
      state.numPages = action.payload.numPages;
      state.fileName = action.payload.fileName;
    },
    resetUpload(state) {
      state.jobId = null;
      state.numPages = 0;
      state.fileName = null;
    },
  },
});

export const { setUploadResult, resetUpload } = uploadSlice.actions;
export default uploadSlice.reducer;
