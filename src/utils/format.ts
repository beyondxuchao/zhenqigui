export const formatFileSize = (bytes: string | number): string => {
    const size = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(size) || size === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];
    const i = Math.floor(Math.log(size) / Math.log(k));

    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
